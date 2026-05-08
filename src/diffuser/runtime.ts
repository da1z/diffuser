import { Effect } from "effect";

import { formatReviewSessionLine } from "./protocol";
import {
	createReviewSessionFromCommand,
	type DiffuserCommand,
	type EmptyPatchError,
	type GitAdapter,
	type GitError,
	type ParseError,
	type ReviewSession,
} from "./workflow";

export interface ReviewServerHandle {
	readonly url: URL;
}

export interface ReviewServerLaunchOptions {
	readonly shutdownOnPageUnload: boolean;
}

export interface ReviewRuntimeInput {
	readonly command: DiffuserCommand;
	readonly cwd: string;
	readonly git: GitAdapter;
	readonly now: () => Date;
	readonly openBrowser: (url: string) => void;
	readonly printLine: (line: string) => void;
	readonly serve: (
		session: ReviewSession,
		options: ReviewServerLaunchOptions
	) => ReviewServerHandle;
}

export interface LaunchedReviewSession {
	readonly server: ReviewServerHandle;
	readonly session: ReviewSession;
	readonly url: string;
}

export const launchReviewSession = ({
	command,
	cwd,
	git,
	now,
	openBrowser,
	printLine,
	serve,
}: ReviewRuntimeInput): Effect.Effect<
	LaunchedReviewSession,
	ParseError | GitError | EmptyPatchError
> =>
	Effect.gen(function* () {
		const session = yield* createReviewSessionFromCommand({
			command,
			cwd,
			git,
			now,
		});
		const server = serve(session, {
			shutdownOnPageUnload: command.openBrowser,
		});
		const url = server.url.toString();

		printLine(formatReviewSessionLine(url));

		if (command.openBrowser) {
			openBrowser(url);
		}

		return { server, session, url };
	});
