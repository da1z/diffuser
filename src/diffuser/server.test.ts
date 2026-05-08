import { expect, test } from "bun:test";

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
	const server = serveReviewSession({ session, open: false });

	try {
		const sessionResponse = await fetch(new URL("/api/session", server.url));
		expect(sessionResponse.status).toBe(200);
		expect(await sessionResponse.json()).toEqual(session);

		const mutationResponse = await fetch(new URL("/api/session", server.url), {
			method: "POST",
		});
		expect(mutationResponse.status).toBe(405);
	} finally {
		server.stop(true);
	}
});
