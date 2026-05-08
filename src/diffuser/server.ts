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

export const serveReviewSession = ({
	onShutdownRequest,
	session,
	shutdownDelayMs = defaultShutdownDelayMs,
	shutdownOnPageUnload = false,
}: ReviewServerOptions): Server<undefined> => {
	let server: Server<undefined>;
	let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
	const cancelPendingShutdown = () => {
		if (shutdownTimer === undefined) {
			return;
		}

		clearTimeout(shutdownTimer);
		shutdownTimer = undefined;
	};
	const scheduleShutdown = () => {
		cancelPendingShutdown();
		shutdownTimer = setTimeout(() => {
			shutdownTimer = undefined;
			onShutdownRequest?.();
			server.stop(true);
		}, shutdownDelayMs);
	};

	server = serve({
		hostname: reviewSessionHost,
		port: 0,
		routes: {
			[reviewSessionShutdownEndpoint]: {
				POST: () => {
					if (!shutdownOnPageUnload) {
						return new Response("Not Found", { status: 404 });
					}

					scheduleShutdown();

					return new Response(null, { status: 204 });
				},
			},
			[reviewSessionEndpoint]: {
				GET: () => {
					cancelPendingShutdown();

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
