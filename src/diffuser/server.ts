import { type Server, serve } from "bun";

import index from "../index.html";
import { reviewSessionEndpoint, reviewSessionHost } from "./protocol";
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
		hostname: reviewSessionHost,
		port: 0,
		routes: {
			[reviewSessionEndpoint]: {
				GET: () => Response.json(session),
				POST: readOnlyResponse,
				PUT: readOnlyResponse,
				PATCH: readOnlyResponse,
				DELETE: readOnlyResponse,
			},
			"/*": index,
		},
	});
