import { type Server, serve } from "bun";

import index from "../index.html";
import {
	reviewSessionEndpoint,
	reviewSessionHost,
	reviewSessionShutdownEndpoint,
} from "./protocol";
import type { ReviewSession } from "./workflow";

export interface ReviewServerOptions {
	readonly onShutdownRequest?: () => void;
	readonly session: ReviewSession;
	readonly shutdownDelayMs?: number;
	readonly shutdownOnPageUnload?: boolean;
}

const readOnlyResponse = () =>
	new Response("Review Sessions are read-only.", { status: 405 });

const defaultShutdownDelayMs = 500;

const createPendingShutdown = ({
	delayMs,
	shutdown,
}: {
	readonly delayMs: number;
	readonly shutdown: () => void;
}) => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const cancel = () => {
		if (timer === undefined) {
			return;
		}

		clearTimeout(timer);
		timer = undefined;
	};
	const schedule = () => {
		cancel();
		timer = setTimeout(() => {
			timer = undefined;
			shutdown();
		}, delayMs);
	};

	return { cancel, schedule };
};

export const serveReviewSession = ({
	onShutdownRequest,
	session,
	shutdownDelayMs = defaultShutdownDelayMs,
	shutdownOnPageUnload = false,
}: ReviewServerOptions): Server<undefined> => {
	let server: Server<undefined>;
	const pendingShutdown = createPendingShutdown({
		delayMs: shutdownDelayMs,
		shutdown: () => {
			onShutdownRequest?.();
			server.stop(true);
		},
	});

	server = serve({
		hostname: reviewSessionHost,
		port: 0,
		routes: {
			[reviewSessionShutdownEndpoint]: {
				POST: () => {
					if (!shutdownOnPageUnload) {
						return new Response("Not Found", { status: 404 });
					}

					pendingShutdown.schedule();

					return new Response(null, { status: 204 });
				},
			},
			[reviewSessionEndpoint]: {
				GET: () => {
					pendingShutdown.cancel();

					return Response.json(session);
				},
				POST: readOnlyResponse,
				PUT: readOnlyResponse,
				PATCH: readOnlyResponse,
				DELETE: readOnlyResponse,
			},
			"/*": index,
		},
	});
	return server;
};
