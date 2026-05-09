import { describe, expect, test } from "bun:test";
import { Effect, Either } from "effect";

import {
	createDiffReviewSession,
	createReviewSession,
	createReviewSessionFromCommand,
	EmptyPatchError,
	GitError,
	ParseError,
	parseDiffuserCommand,
} from "./workflow";

describe("Diffuser command parsing", () => {
	test("parses --no-open before diff and preserves Git-shaped diff arguments", () => {
		const command = parseDiffuserCommand([
			"--no-open",
			"diff",
			"main...HEAD",
			"--",
			"src/",
		]);

		expect(command).toEqual({
			kind: "diff",
			openBrowser: false,
			gitArgs: ["main...HEAD", "--", "src/"],
		});
	});
});

describe("diff Review Sessions", () => {
	test("creates a session from a parsed diff command without reparsing argv", async () => {
		const calls: Array<{
			command: "diff" | "root";
			args: readonly string[];
			cwd: string;
		}> = [];

		const session = await Effect.runPromise(
			createReviewSessionFromCommand({
				command: parseDiffuserCommand(["--no-open", "diff", "--staged"]),
				cwd: "/repo/packages/app",
				now: () => new Date("2026-05-08T02:41:00.000Z"),
				git: {
					diff: ({ args, cwd }) => {
						calls.push({ command: "diff", args, cwd });
						return Effect.succeed({
							stdout:
								"diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new\n",
							stderr: "",
						});
					},
					showCommit: () => Effect.die("should not run"),
					blob: () => Effect.die("blob should not run"),
					workingTreeFile: () => Effect.die("workingTreeFile should not run"),
					repositoryRoot: ({ cwd }) => {
						calls.push({ command: "root", args: [], cwd });
						return Effect.succeed("/repo");
					},
				},
			})
		);

		expect(calls).toEqual([
			{ command: "diff", args: ["--staged"], cwd: "/repo/packages/app" },
			{ command: "root", args: [], cwd: "/repo/packages/app" },
		]);
		expect(session.kind).toBe("diff");
		expect(session.context.command).toBe("diffuser diff --staged");
	});

	test("creates an immutable read-only session from non-empty git diff output", async () => {
		const calls: Array<{
			command: "diff" | "root";
			args: readonly string[];
			cwd: string;
		}> = [];

		const session = await Effect.runPromise(
			createDiffReviewSession({
				argv: ["diff", "--staged"],
				cwd: "/repo/packages/app",
				now: () => new Date("2026-05-08T02:41:00.000Z"),
				git: {
					diff: ({ args, cwd }) => {
						calls.push({ command: "diff", args, cwd });
						return Effect.succeed({
							stdout:
								"diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new\n",
							stderr: "",
						});
					},
					showCommit: () => Effect.die("should not run"),
					blob: () => Effect.die("blob should not run"),
					workingTreeFile: () => Effect.die("workingTreeFile should not run"),
					repositoryRoot: ({ cwd }) => {
						calls.push({ command: "root", args: [], cwd });
						return Effect.succeed("/repo");
					},
				},
			})
		);

		expect(calls).toEqual([
			{ command: "diff", args: ["--staged"], cwd: "/repo/packages/app" },
			{ command: "root", args: [], cwd: "/repo/packages/app" },
		]);
		expect(session).toEqual({
			id: "diff-2026-05-08T02:41:00.000Z",
			mode: "read-only",
			kind: "diff",
			patch:
				"diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new\n",
			context: {
				command: "diffuser diff --staged",
				args: ["--staged"],
				capturedAt: "2026-05-08T02:41:00.000Z",
				repository: {
					root: "/repo",
					workingDirectory: "/repo/packages/app",
				},
			},
		});
	});

	test("rejects empty Patches before creating a Review Session", async () => {
		const result = await Effect.runPromise(
			Effect.either(
				createDiffReviewSession({
					argv: ["diff"],
					cwd: "/repo",
					now: () => new Date("2026-05-08T02:41:00.000Z"),
					git: {
						diff: () => Effect.succeed({ stdout: "", stderr: "" }),
						showCommit: () => Effect.die("should not run"),
						blob: () => Effect.die("blob should not run"),
						workingTreeFile: () => Effect.die("workingTreeFile should not run"),
						repositoryRoot: () => Effect.die("should not run"),
					},
				})
			)
		);

		expect(Either.isLeft(result)).toBe(true);
		if (Either.isLeft(result)) {
			expect(result.left).toBeInstanceOf(EmptyPatchError);
		}
	});

	test("creates patch-only sessions without reading full file contents", async () => {
		const patch =
			"diff --git a/file.txt b/file.txt\nindex 1111111..2222222 100644\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new\n";
		const calls: Array<{
			command: "diff" | "root";
			args?: readonly string[];
			cwd: string;
		}> = [];

		const session = await Effect.runPromise(
			createDiffReviewSession({
				argv: ["diff"],
				cwd: "/repo",
				now: () => new Date("2026-05-08T02:41:00.000Z"),
				git: {
					diff: ({ args, cwd }) => {
						calls.push({ command: "diff", args, cwd });
						return Effect.succeed({ stdout: patch, stderr: "" });
					},
					showCommit: () => Effect.die("should not run"),
					blob: () => Effect.die("blob should not run"),
					workingTreeFile: () => Effect.die("workingTreeFile should not run"),
					repositoryRoot: ({ cwd }) => {
						calls.push({ command: "root", cwd });
						return Effect.succeed("/repo");
					},
				},
			})
		);

		expect(calls).toEqual([
			{ command: "diff", args: [], cwd: "/repo" },
			{ command: "root", cwd: "/repo" },
		]);
		expect(session.patch).toBe(patch);
		expect("diffFileSnapshots" in session).toBe(false);
	});
});

describe("show Commit Reviews", () => {
	test("creates a Commit Review from a parsed show command", async () => {
		const calls: Array<{
			command: "show" | "root";
			commitish?: string;
			pathspec?: readonly string[];
			cwd: string;
		}> = [];

		const session = await Effect.runPromise(
			createReviewSessionFromCommand({
				command: parseDiffuserCommand(["show", "abc123", "--", "src/"]),
				cwd: "/repo/packages/app",
				now: () => new Date("2026-05-08T03:10:00.000Z"),
				git: {
					blob: () => Effect.die("blob should not run"),
					diff: () => Effect.die("should not run"),
					showCommit: ({ commitish, pathspec, cwd }) => {
						calls.push({ command: "show", commitish, pathspec, cwd });
						return Effect.succeed({
							metadata: {
								oid: "abc123def456",
								shortOid: "abc123",
								authorName: "Ada Lovelace",
								authorEmail: "ada@example.com",
								authoredAt: "2026-05-07T12:00:00+00:00",
								subject: "Path filtered commit",
							},
							patch:
								"diff --git a/src/file.txt b/src/file.txt\n--- a/src/file.txt\n+++ b/src/file.txt\n@@ -1 +1 @@\n-old\n+new\n",
						});
					},
					repositoryRoot: ({ cwd }) => {
						calls.push({ command: "root", cwd });
						return Effect.succeed("/repo");
					},
					workingTreeFile: () => Effect.die("workingTreeFile should not run"),
				},
			})
		);

		expect(calls).toEqual([
			{
				command: "show",
				commitish: "abc123",
				pathspec: ["src/"],
				cwd: "/repo/packages/app",
			},
			{ command: "root", cwd: "/repo/packages/app" },
		]);
		expect(session.kind).toBe("show");
		expect(session.context.command).toBe("diffuser show abc123 -- src/");
	});

	test("rejects a parsed help command before running Git", async () => {
		const result = await Effect.runPromise(
			Effect.either(
				createReviewSessionFromCommand({
					command: parseDiffuserCommand([]),
					cwd: "/repo",
					now: () => new Date("2026-05-08T03:10:00.000Z"),
					git: {
						blob: () => Effect.die("should not run"),
						diff: () => Effect.die("should not run"),
						showCommit: () => Effect.die("should not run"),
						repositoryRoot: () => Effect.die("should not run"),
						workingTreeFile: () => Effect.die("should not run"),
					},
				})
			)
		);

		expect(Either.isLeft(result)).toBe(true);
		if (Either.isLeft(result)) {
			expect(result.left).toBeInstanceOf(ParseError);
			expect(result.left.message).toBe(
				"Expected diffuser diff or show arguments."
			);
		}
	});

	test("defaults to HEAD and creates a Commit Review with metadata", async () => {
		const calls: Array<{
			command: "show" | "root";
			commitish?: string;
			pathspec?: readonly string[];
			cwd: string;
		}> = [];

		const session = await Effect.runPromise(
			createReviewSession({
				argv: ["show"],
				cwd: "/repo/packages/app",
				now: () => new Date("2026-05-08T03:10:00.000Z"),
				git: {
					blob: () => Effect.die("blob should not run"),
					diff: () => Effect.die("should not run"),
					showCommit: ({ commitish, pathspec, cwd }) => {
						calls.push({ command: "show", commitish, pathspec, cwd });
						return Effect.succeed({
							metadata: {
								oid: "abc123def456",
								shortOid: "abc123d",
								authorName: "Ada Lovelace",
								authorEmail: "ada@example.com",
								authoredAt: "2026-05-07T12:00:00+00:00",
								subject: "Teach diffuser to show commits",
							},
							patch:
								"diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new\n",
						});
					},
					repositoryRoot: ({ cwd }) => {
						calls.push({ command: "root", cwd });
						return Effect.succeed("/repo");
					},
					workingTreeFile: () => Effect.die("workingTreeFile should not run"),
				},
			})
		);

		expect(calls).toEqual([
			{
				command: "show",
				commitish: "HEAD",
				pathspec: [],
				cwd: "/repo/packages/app",
			},
			{ command: "root", cwd: "/repo/packages/app" },
		]);
		expect(session).toEqual({
			id: "show-2026-05-08T03:10:00.000Z",
			mode: "read-only",
			kind: "show",
			patch:
				"diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new\n",
			context: {
				command: "diffuser show HEAD",
				args: ["HEAD"],
				capturedAt: "2026-05-08T03:10:00.000Z",
				repository: {
					root: "/repo",
					workingDirectory: "/repo/packages/app",
				},
				commit: {
					oid: "abc123def456",
					shortOid: "abc123d",
					authorName: "Ada Lovelace",
					authorEmail: "ada@example.com",
					authoredAt: "2026-05-07T12:00:00+00:00",
					subject: "Teach diffuser to show commits",
				},
			},
		});
	});

	test("uses an explicit commit-ish while limiting the Patch to pathspecs", async () => {
		const calls: Array<{
			command: "show" | "root";
			commitish?: string;
			pathspec?: readonly string[];
			cwd: string;
		}> = [];

		await Effect.runPromise(
			createReviewSession({
				argv: ["show", "abc123", "--", "src/", "README.md"],
				cwd: "/repo",
				now: () => new Date("2026-05-08T03:11:00.000Z"),
				git: {
					blob: () => Effect.die("blob should not run"),
					diff: () => Effect.die("should not run"),
					showCommit: ({ commitish, pathspec, cwd }) => {
						calls.push({ command: "show", commitish, pathspec, cwd });
						return Effect.succeed({
							metadata: {
								oid: "abc123def456",
								shortOid: "abc123",
								authorName: "Ada Lovelace",
								authorEmail: "ada@example.com",
								authoredAt: "2026-05-07T12:00:00+00:00",
								subject: "Limit paths",
							},
							patch:
								"diff --git a/src/file.txt b/src/file.txt\n--- a/src/file.txt\n+++ b/src/file.txt\n@@ -1 +1 @@\n-old\n+new\n",
						});
					},
					repositoryRoot: ({ cwd }) => {
						calls.push({ command: "root", cwd });
						return Effect.succeed("/repo");
					},
					workingTreeFile: () => Effect.die("workingTreeFile should not run"),
				},
			})
		);

		expect(calls).toEqual([
			{
				command: "show",
				commitish: "abc123",
				pathspec: ["src/", "README.md"],
				cwd: "/repo",
			},
			{ command: "root", cwd: "/repo" },
		]);
	});

	test("rejects arbitrary git show formatting options before running Git", async () => {
		const result = await Effect.runPromise(
			Effect.either(
				createReviewSession({
					argv: ["show", "--stat"],
					cwd: "/repo",
					now: () => new Date("2026-05-08T03:12:00.000Z"),
					git: {
						blob: () => Effect.die("should not run"),
						diff: () => Effect.die("should not run"),
						showCommit: () => Effect.die("should not run"),
						repositoryRoot: () => Effect.die("should not run"),
						workingTreeFile: () => Effect.die("should not run"),
					},
				})
			)
		);

		expect(Either.isLeft(result)).toBe(true);
		if (Either.isLeft(result)) {
			expect(result.left).toBeInstanceOf(ParseError);
		}
	});

	test("keeps Git errors terminal for Commit Reviews", async () => {
		const result = await Effect.runPromise(
			Effect.either(
				createReviewSession({
					argv: ["show", "missing-ref"],
					cwd: "/repo",
					now: () => new Date("2026-05-08T03:13:00.000Z"),
					git: {
						blob: () => Effect.die("should not run"),
						diff: () => Effect.die("should not run"),
						showCommit: () =>
							Effect.fail(
								new GitError({
									message: "git show failed",
									stderr: "fatal: ambiguous argument 'missing-ref'",
								})
							),
						repositoryRoot: () => Effect.die("should not run"),
						workingTreeFile: () => Effect.die("should not run"),
					},
				})
			)
		);

		expect(Either.isLeft(result)).toBe(true);
		if (Either.isLeft(result)) {
			expect(result.left).toBeInstanceOf(GitError);
		}
	});

	test("rejects empty Commit Review Patches before creating a session", async () => {
		const result = await Effect.runPromise(
			Effect.either(
				createReviewSession({
					argv: ["show", "HEAD"],
					cwd: "/repo",
					now: () => new Date("2026-05-08T03:14:00.000Z"),
					git: {
						blob: () => Effect.die("should not run"),
						diff: () => Effect.die("should not run"),
						showCommit: () =>
							Effect.succeed({
								metadata: {
									oid: "abc123def456",
									shortOid: "abc123d",
									authorName: "Ada Lovelace",
									authorEmail: "ada@example.com",
									authoredAt: "2026-05-07T12:00:00+00:00",
									subject: "No file changes",
								},
								patch: "",
							}),
						repositoryRoot: () => Effect.die("should not run"),
						workingTreeFile: () => Effect.die("should not run"),
					},
				})
			)
		);

		expect(Either.isLeft(result)).toBe(true);
		if (Either.isLeft(result)) {
			expect(result.left).toBeInstanceOf(EmptyPatchError);
		}
	});
});
