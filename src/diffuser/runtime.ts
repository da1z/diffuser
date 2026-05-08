import { Effect } from "effect";

import { formatReviewSessionLine } from "./protocol";
import {
	createReviewSession,
	type DiffWorkflowInput,
	type EmptyPatchError,
	type GitError,
	type ParseError,
	parseDiffuserCommand,
	type ReviewSession,
} from "./workflow";

export interface ReviewServerHandle {
	readonly url: URL;
}

export interface ReviewServerLaunchOptions {
	readonly shutdownOnPageUnload: boolean;
}

export interface ReviewRuntimeInput extends DiffWorkflowInput {
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
	argv,
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
		const command = parseDiffuserCommand(argv);
		const session = yield* createReviewSession({ argv, cwd, git, now });
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
