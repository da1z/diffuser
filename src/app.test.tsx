import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { App } from "./review-app";

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
