import { type Server, serve } from "bun";

import index from "../index.html";
import type { ReviewSession } from "./workflow";

export interface ReviewServerOptions {
	readonly open?: boolean;
	readonly session: ReviewSession;
}

export const serveReviewSession = ({
	session,
}: ReviewServerOptions): Server<undefined> =>
	serve({
		hostname: "127.0.0.1",
		port: 0,
		routes: {
			"/api/session": {
				GET: () => Response.json(session),
				POST: () =>
					new Response("Review Sessions are read-only.", { status: 405 }),
				PUT: () =>
					new Response("Review Sessions are read-only.", { status: 405 }),
				PATCH: () =>
					new Response("Review Sessions are read-only.", { status: 405 }),
				DELETE: () =>
					new Response("Review Sessions are read-only.", { status: 405 }),
			},
			"/*": index,
		},
	});
