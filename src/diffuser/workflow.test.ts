import { describe, expect, test } from "bun:test";
import { Effect, Either } from "effect";

import {
	createDiffReviewSession,
	EmptyPatchError,
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
});
