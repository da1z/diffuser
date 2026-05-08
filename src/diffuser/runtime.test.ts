import { expect, test } from "bun:test";
import { Effect } from "effect";

import { formatReviewSessionLine } from "./protocol";
import { launchReviewSession } from "./runtime";
import type { ReviewSession } from "./workflow";

test("launches a one-shot Review Session and opens the Local Review UI by default", async () => {
	const openedUrls: string[] = [];
	const printedLines: string[] = [];
	const servedSessions: ReviewSession[] = [];

	const launch = await Effect.runPromise(
		launchReviewSession({
			argv: ["diff", "--staged"],
			cwd: "/repo",
			now: () => new Date("2026-05-08T02:41:00.000Z"),
			git: {
				diff: () =>
					Effect.succeed({
						stdout: "diff --git a/file.txt b/file.txt\n",
						stderr: "",
					}),
				repositoryRoot: () => Effect.succeed("/repo"),
				showCommit: () =>
					Effect.die("showCommit should not run for diffuser diff"),
			},
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

	await Effect.runPromise(
		launchReviewSession({
			argv: ["--no-open", "diff"],
			cwd: "/repo",
			now: () => new Date("2026-05-08T02:41:00.000Z"),
			git: {
				diff: () =>
					Effect.succeed({
						stdout: "diff --git a/file.txt b/file.txt\n",
						stderr: "",
					}),
				repositoryRoot: () => Effect.succeed("/repo"),
				showCommit: () =>
					Effect.die("showCommit should not run for diffuser diff"),
			},
			serve: () => ({ url: new URL("http://127.0.0.1:49153/") }),
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
	expect(openedUrls).toEqual([]);
});
