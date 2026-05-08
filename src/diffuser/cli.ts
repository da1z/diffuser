#!/usr/bin/env bun
import { spawn } from "bun";
import { Cause, Effect, Exit, Option } from "effect";

import { serveReviewSession } from "./server";
import {
	bunGitAdapter,
	createReviewSession,
	diffuserHelp,
	EmptyPatchError,
	GitError,
	parseDiffuserCommand,
} from "./workflow";

const browserCommand = (
	platform: typeof process.platform,
	url: string
): string[] => {
	switch (platform) {
		case "darwin":
			return ["open", url];
		case "win32":
			return ["cmd", "/c", "start", "", url];
		default:
			return ["xdg-open", url];
	}
};

const openBrowser = (url: string) => {
	try {
		spawn(browserCommand(process.platform, url), {
			stdout: "ignore",
			stderr: "ignore",
		});
	} catch {
		console.error(
			`Could not open browser automatically. Review Session: ${url}`
		);
	}
};

const argv = process.argv.slice(2);
const parsed = parseDiffuserCommand(argv);

if (parsed.kind === "help") {
	console.log(diffuserHelp);
	process.exit(1);
}

const exit = await Effect.runPromiseExit(
	createReviewSession({
		argv,
		cwd: process.cwd(),
		now: () => new Date(),
		git: bunGitAdapter,
	})
);

if (Exit.isFailure(exit)) {
	const error = Option.getOrUndefined(Cause.failureOption(exit.cause));

	if (error instanceof GitError) {
		console.error(error.stderr?.trim() || error.message);
	} else if (error instanceof EmptyPatchError) {
		console.error(error.message);
	} else {
		console.error("Diffuser could not create a Review Session.");
	}

	process.exit(1);
}

const server = serveReviewSession({ session: exit.value });
const url = server.url.toString();

console.log(`Review Session: ${url}`);

if (parsed.openBrowser) {
	openBrowser(url);
}

process.stdin.resume();
