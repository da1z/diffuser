import { expect, test } from "bun:test";

import { reviewSessionEndpoint, reviewSessionHost } from "./protocol";
import { serveReviewSession } from "./server";
import type { ReviewSession } from "./workflow";

const session: ReviewSession = {
	id: "diff-2026-05-08T02:41:00.000Z",
	mode: "read-only",
	kind: "diff",
	patch: "diff --git a/file.txt b/file.txt\n",
	context: {
		command: "diffuser diff",
		args: [],
		capturedAt: "2026-05-08T02:41:00.000Z",
		repository: {
			root: "/repo",
			workingDirectory: "/repo",
		},
	},
};

test("serves the captured Review Session through a read-only endpoint", async () => {
	const server = serveReviewSession({ session });

	try {
		expect(server.url.hostname).toBe(reviewSessionHost);

		const sessionResponse = await fetch(
			new URL(reviewSessionEndpoint, server.url)
		);
		expect(sessionResponse.status).toBe(200);
		expect(await sessionResponse.json()).toEqual(session);

		const mutationResponse = await fetch(
			new URL(reviewSessionEndpoint, server.url),
			{
				method: "POST",
			}
		);
		expect(mutationResponse.status).toBe(405);
	} finally {
		server.stop(true);
	}
});

test("serves the Local Review UI shell alongside the Session Endpoint", async () => {
	const server = serveReviewSession({ session });

	try {
		const response = await fetch(new URL("/", server.url));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		expect(html).toContain('<div id="root"></div>');
	} finally {
		server.stop(true);
	}
});
