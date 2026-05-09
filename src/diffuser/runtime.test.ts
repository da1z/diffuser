import { expect, test } from "bun:test";
import { Effect } from "effect";

import { formatReviewSessionLine } from "./protocol";
import { launchReviewSession, type ReviewServerLaunchOptions } from "./runtime";
import {
	type GitAdapter,
	parseDiffuserCommand,
	type ReviewSession,
} from "./workflow";

const diffGitAdapter = {
	diff: () =>
		Effect.succeed({
			stdout: "diff --git a/file.txt b/file.txt\n",
			stderr: "",
		}),
	repositoryRoot: () => Effect.succeed("/repo"),
	showCommit: () => Effect.die("showCommit should not run for diffuser diff"),
} satisfies GitAdapter;

test("launches from one parsed diffuser diff command", async () => {
	const openedUrls: string[] = [];
	const printedLines: string[] = [];
	const servedSessions: ReviewSession[] = [];
	const servedOptions: ReviewServerLaunchOptions[] = [];

	const launch = await Effect.runPromise(
		launchReviewSession({
			command: parseDiffuserCommand(["diff", "--staged"]),
			cwd: "/repo",
			now: () => new Date("2026-05-08T02:41:00.000Z"),
			git: diffGitAdapter,
			serve: (session, options) => {
				servedSessions.push(session);
				servedOptions.push(options);
				return { url: new URL("http://127.0.0.1:49152/") };
			},
			openBrowser: (url) => {
				openedUrls.push(url);
			},
			printLine: (line) => {
				printedLines.push(line);
			},
		})
	);

	expect(launch.session.kind).toBe("diff");
	expect(launch.session.context.command).toBe("diffuser diff --staged");
	expect(servedSessions).toEqual([launch.session]);
	expect(servedOptions).toEqual([{ shutdownOnPageUnload: true }]);
	expect(printedLines).toEqual([
		formatReviewSessionLine("http://127.0.0.1:49152/"),
	]);
	expect(openedUrls).toEqual(["http://127.0.0.1:49152/"]);
});

test("launches a one-shot Review Session and opens the Local Review UI by default", async () => {
	const openedUrls: string[] = [];
	const printedLines: string[] = [];
	const servedSessions: ReviewSession[] = [];

	const launch = await Effect.runPromise(
		launchReviewSession({
			command: parseDiffuserCommand(["diff", "--staged"]),
			cwd: "/repo",
			now: () => new Date("2026-05-08T02:41:00.000Z"),
			git: diffGitAdapter,
			serve: (session) => {
				servedSessions.push(session);
				return { url: new URL("http://127.0.0.1:49152/") };
			},
			openBrowser: (url) => {
				openedUrls.push(url);
			},
			printLine: (line) => {
				printedLines.push(line);
			},
		})
	);

	expect(launch.url).toBe("http://127.0.0.1:49152/");
	expect(servedSessions).toEqual([launch.session]);
	expect(printedLines).toEqual([
		formatReviewSessionLine("http://127.0.0.1:49152/"),
	]);
	expect(openedUrls).toEqual(["http://127.0.0.1:49152/"]);
});

test("--no-open prints the URL without opening a browser", async () => {
	const openedUrls: string[] = [];
	const printedLines: string[] = [];
	const servedOptions: unknown[] = [];

	await Effect.runPromise(
		launchReviewSession({
			command: parseDiffuserCommand(["--no-open", "diff"]),
			cwd: "/repo",
			now: () => new Date("2026-05-08T02:41:00.000Z"),
			git: diffGitAdapter,
			serve: (_session: ReviewSession, options: ReviewServerLaunchOptions) => {
				servedOptions.push(options);

				return { url: new URL("http://127.0.0.1:49153/") };
			},
			openBrowser: (url) => {
				openedUrls.push(url);
			},
			printLine: (line) => {
				printedLines.push(line);
			},
		})
	);

	expect(printedLines).toEqual([
		formatReviewSessionLine("http://127.0.0.1:49153/"),
	]);
	expect(servedOptions).toEqual([{ shutdownOnPageUnload: false }]);
	expect(openedUrls).toEqual([]);
});

test("enables browser unload shutdown only for auto-open sessions", async () => {
	const servedOptions: unknown[] = [];

	await Effect.runPromise(
		launchReviewSession({
			command: parseDiffuserCommand(["diff"]),
			cwd: "/repo",
			now: () => new Date("2026-05-08T02:41:00.000Z"),
			git: diffGitAdapter,
			serve: (_session: ReviewSession, options: ReviewServerLaunchOptions) => {
				servedOptions.push(options);

				return { url: new URL("http://127.0.0.1:49155/") };
			},
			openBrowser: () => undefined,
			printLine: () => undefined,
		})
	);

	expect(servedOptions).toEqual([{ shutdownOnPageUnload: true }]);
});

test("launches diffuser show as a browser Commit Review through the Workflow Runtime", async () => {
	const openedUrls: string[] = [];
	const printedLines: string[] = [];
	const servedSessions: ReviewSession[] = [];

	const launch = await Effect.runPromise(
		launchReviewSession({
			command: parseDiffuserCommand(["show", "HEAD"]),
			cwd: "/repo",
			now: () => new Date("2026-05-08T03:10:00.000Z"),
			git: {
				diff: () => Effect.die("diff should not run for diffuser show"),
				repositoryRoot: () => Effect.succeed("/repo"),
				showCommit: ({ commitish, pathspec }) => {
					expect(commitish).toBe("HEAD");
					expect(pathspec).toEqual([]);

					return Effect.succeed({
						metadata: {
							oid: "abc123def456",
							shortOid: "abc123d",
							authorName: "Ada Lovelace",
							authorEmail: "ada@example.com",
							authoredAt: "2026-05-07T12:00:00+00:00",
							subject: "Teach diffuser to show commits",
						},
						patch: "diff --git a/file.txt b/file.txt\n",
					});
				},
			},
			serve: (session) => {
				servedSessions.push(session);
				return { url: new URL("http://127.0.0.1:49154/") };
			},
			openBrowser: (url) => {
				openedUrls.push(url);
			},
			printLine: (line) => {
				printedLines.push(line);
			},
		})
	);

	expect(launch.session.kind).toBe("show");
	expect(launch.session.context.command).toBe("diffuser show HEAD");
	expect(launch.session.context.commit?.shortOid).toBe("abc123d");
	expect(servedSessions).toEqual([launch.session]);
	expect(printedLines).toEqual([
		formatReviewSessionLine("http://127.0.0.1:49154/"),
	]);
	expect(openedUrls).toEqual(["http://127.0.0.1:49154/"]);
});
