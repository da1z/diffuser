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
