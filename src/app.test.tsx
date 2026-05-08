import { expect, test } from "bun:test";
import { parsePatchFiles } from "@pierre/diffs";
import { renderToStaticMarkup } from "react-dom/server";

import { reviewSessionEndpoint } from "./diffuser/protocol";
import type { ReviewSession } from "./diffuser/workflow";
import {
	App,
	continuousDiffViewOptions,
	loadReviewSession,
} from "./review-app";

const multiFilePatch = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-old
+new
diff --git a/b.txt b/b.txt
--- a/b.txt
+++ b/b.txt
@@ -1 +1 @@
-before
+after
`;

const reviewSession = (
	overrides: Partial<ReviewSession> = {}
): ReviewSession => ({
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
	...overrides,
});

const renderReviewSession = (session: ReviewSession) =>
	renderToStaticMarkup(<App initialSession={session} />);

test("loads the Review Session from the Session Endpoint", async () => {
	const requests: string[] = [];
	const session = reviewSession();

	const loaded = await loadReviewSession((input) => {
		requests.push(String(input));
		return Promise.resolve(Response.json(session));
	});

	expect(requests).toEqual([reviewSessionEndpoint]);
	expect(loaded).toEqual(session);
});

test("renders the Review Header for a captured session", () => {
	const html = renderReviewSession(
		reviewSession({
			context: {
				command: "diffuser diff --staged",
				args: ["--staged"],
				capturedAt: "2026-05-08T02:41:00.000Z",
				repository: {
					root: "/repo",
					workingDirectory: "/repo/packages/app",
				},
			},
		})
	);

	expect(html).toContain("Diffuser Review");
	expect(html).toContain("diffuser diff --staged");
	expect(html).toContain("/repo/packages/app");
});

test("renders a Continuous Diff View for a multi-file Patch", () => {
	const html = renderReviewSession(
		reviewSession({
			patch: multiFilePatch,
		})
	);

	expect(html).toContain('aria-label="Patch"');
	expect(html.match(/<diffs-container/g)).toHaveLength(2);
});

test("configures Pierre hunk affordances within the Patch-only renderer scope", () => {
	const session = reviewSession({ patch: multiFilePatch });
	const parsedPatch = parsePatchFiles(multiFilePatch)[0];
	const firstFile = parsedPatch?.files[0];

	expect(continuousDiffViewOptions).toEqual({
		diffStyle: "split",
		hunkSeparators: "line-info-basic",
	});
	expect(firstFile?.isPartial).toBe(true);
	expect(session).not.toHaveProperty("oldFile");
	expect(session).not.toHaveProperty("newFile");
});

test("renders commit metadata for a Commit Review", () => {
	const html = renderReviewSession(
		reviewSession({
			id: "show-2026-05-08T03:10:00.000Z",
			kind: "show",
			context: {
				command: "diffuser show HEAD",
				args: ["HEAD"],
				capturedAt: "2026-05-08T03:10:00.000Z",
				commit: {
					oid: "abc123def456",
					shortOid: "abc123d",
					authorName: "Ada Lovelace",
					authorEmail: "ada@example.com",
					authoredAt: "2026-05-07T12:00:00+00:00",
					subject: "Teach diffuser to show commits",
				},
				repository: {
					root: "/repo",
					workingDirectory: "/repo/packages/app",
				},
			},
		})
	);

	expect(html).toContain("diffuser show HEAD");
	expect(html).toContain("abc123d");
	expect(html).toContain("Ada Lovelace");
	expect(html).toContain("Teach diffuser to show commits");
});
