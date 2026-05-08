import type { Server } from "bun";
import { Effect } from "effect";

import {
	createDiffReviewSession,
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

export interface DiffRuntimeInput extends DiffWorkflowInput {
	readonly openBrowser: (url: string) => void;
	readonly printLine: (line: string) => void;
	readonly serve: (session: ReviewSession) => ReviewServerHandle;
}

export interface LaunchedReviewSession {
	readonly server: ReviewServerHandle;
	readonly session: ReviewSession;
	readonly url: string;
}

export const launchDiffReviewSession = ({
	argv,
	cwd,
	git,
	now,
	openBrowser,
	printLine,
	serve,
}: DiffRuntimeInput): Effect.Effect<
	LaunchedReviewSession,
	ParseError | GitError | EmptyPatchError
> =>
	Effect.gen(function* () {
		const command = parseDiffuserCommand(argv);
		const session = yield* createDiffReviewSession({ argv, cwd, git, now });
		const server = serve(session);
		const url = server.url.toString();

		printLine(`Review Session: ${url}`);

		if (command.openBrowser) {
			openBrowser(url);
		}

		return { server, session, url };
	});

export type DiffuserServer = Server<undefined>;
