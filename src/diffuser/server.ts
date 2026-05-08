import { type Server, serve } from "bun";

import index from "../index.html";
import type { ReviewSession } from "./workflow";

export interface ReviewServerOptions {
	readonly session: ReviewSession;
}

const readOnlyResponse = () =>
	new Response("Review Sessions are read-only.", { status: 405 });

export const serveReviewSession = ({
	session,
}: ReviewServerOptions): Server<undefined> =>
	serve({
		hostname: "127.0.0.1",
		port: 0,
		routes: {
			"/api/session": {
				GET: () => Response.json(session),
				POST: readOnlyResponse,
				PUT: readOnlyResponse,
				PATCH: readOnlyResponse,
				DELETE: readOnlyResponse,
			},
			"/*": index,
		},
	});
