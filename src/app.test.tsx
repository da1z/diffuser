import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { reviewSessionEndpoint } from "./diffuser/protocol";
import { App, loadReviewSession } from "./review-app";

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

test("loads the Review Session from the Session Endpoint", async () => {
	const requests: string[] = [];
	const session = {
		id: "diff-2026-05-08T02:41:00.000Z",
		mode: "read-only" as const,
		kind: "diff" as const,
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

	const loaded = await loadReviewSession((input) => {
		requests.push(String(input));
		return Promise.resolve(Response.json(session));
	});

	expect(requests).toEqual([reviewSessionEndpoint]);
	expect(loaded).toEqual(session);
});

test("renders the Review Header for a captured session", () => {
	const html = renderToStaticMarkup(
		<App
			initialSession={{
				id: "diff-2026-05-08T02:41:00.000Z",
				mode: "read-only",
				kind: "diff",
				patch: "diff --git a/file.txt b/file.txt\n",
				context: {
					command: "diffuser diff --staged",
					args: ["--staged"],
					capturedAt: "2026-05-08T02:41:00.000Z",
					repository: {
						root: "/repo",
						workingDirectory: "/repo/packages/app",
					},
				},
			}}
		/>
	);

	expect(html).toContain("Diffuser Review");
	expect(html).toContain("diffuser diff --staged");
	expect(html).toContain("/repo/packages/app");
});

test("renders a Continuous Diff View for a multi-file Patch", () => {
	const html = renderToStaticMarkup(
		<App
			initialSession={{
				id: "diff-2026-05-08T02:41:00.000Z",
				mode: "read-only",
				kind: "diff",
				patch: multiFilePatch,
				context: {
					command: "diffuser diff",
					args: [],
					capturedAt: "2026-05-08T02:41:00.000Z",
					repository: {
						root: "/repo",
						workingDirectory: "/repo",
					},
				},
			}}
		/>
	);

	expect(html).toContain('aria-label="Patch"');
	expect(html.match(/<diffs-container/g)).toHaveLength(2);
});

test("renders commit metadata for a Commit Review", () => {
	const html = renderToStaticMarkup(
		<App
			initialSession={{
				id: "show-2026-05-08T03:10:00.000Z",
				mode: "read-only",
				kind: "show",
				patch: "diff --git a/file.txt b/file.txt\n",
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
			}}
		/>
	);

	expect(html).toContain("diffuser show HEAD");
	expect(html).toContain("abc123d");
	expect(html).toContain("Ada Lovelace");
	expect(html).toContain("Teach diffuser to show commits");
});
