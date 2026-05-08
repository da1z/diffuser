import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { reviewSessionEndpoint } from "./diffuser/protocol";
import type { ReviewSession } from "./diffuser/workflow";
import {
	App,
	ContinuousPatchDiff,
	type FileDiffRendererProps,
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

const repeatedFilePatch = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-old
+new
diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-old
+new
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

const renderInteractive = (children: ReactNode) => {
	const window = new Window({ url: "http://localhost" });
	window.SyntaxError = SyntaxError;
	Object.assign(globalThis, {
		IS_REACT_ACT_ENVIRONMENT: true,
		window,
		document: window.document,
		HTMLElement: window.HTMLElement,
		HTMLInputElement: window.HTMLInputElement,
		Event: window.Event,
		MouseEvent: window.MouseEvent,
		Node: window.Node,
	});

	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);

	act(() => {
		root.render(children);
	});

	return { container, root };
};

const FileDiffProbe = ({
	fileDiff,
	options,
	renderHeaderPrefix,
	renderHeaderMetadata,
}: FileDiffRendererProps) => {
	const fileName = fileDiff.name ?? "unknown";
	const collapsed = options?.collapsed ?? false;

	return (
		<article data-collapsed={String(collapsed)} data-file={fileName}>
			<header>
				{renderHeaderPrefix?.(fileDiff)}
				<span>{fileName}</span>
				{renderHeaderMetadata?.(fileDiff)}
			</header>
			{collapsed ? undefined : <p>{fileName} body</p>}
		</article>
	);
};

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

test("keeps viewed and collapsed file state independent in the Local Review UI", () => {
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff DiffRenderer={FileDiffProbe} patch={multiFilePatch} />
	);
	const file = () =>
		container.querySelector<HTMLElement>('[data-file="a.txt"]');
	const viewed = () =>
		container.querySelector<HTMLInputElement>(
			'input[aria-label="Mark a.txt viewed"]'
		);
	const secondViewed = () =>
		container.querySelector<HTMLInputElement>(
			'input[aria-label="Mark b.txt viewed"]'
		);
	const collapseToggle = () =>
		container.querySelector<HTMLButtonElement>(
			'button[aria-label="Toggle a.txt collapsed"]'
		);
	const secondCollapseToggle = () =>
		container.querySelector<HTMLButtonElement>(
			'button[aria-label="Toggle b.txt collapsed"]'
		);

	expect(
		container.querySelectorAll('input[type="checkbox"][aria-label$="viewed"]')
	).toHaveLength(2);
	expect(viewed()?.checked).toBe(false);
	expect(file()?.dataset.collapsed).toBe("false");
	expect(container.textContent).toContain("a.txt body");

	act(() => {
		viewed()?.click();
	});

	expect(viewed()?.checked).toBe(true);
	expect(file()?.dataset.collapsed).toBe("true");
	expect(container.textContent).not.toContain("a.txt body");

	act(() => {
		collapseToggle()?.click();
	});

	expect(viewed()?.checked).toBe(true);
	expect(file()?.dataset.collapsed).toBe("false");
	expect(container.textContent).toContain("a.txt body");

	act(() => {
		collapseToggle()?.click();
	});
	act(() => {
		viewed()?.click();
	});

	expect(viewed()?.checked).toBe(false);
	expect(file()?.dataset.collapsed).toBe("true");

	act(() => {
		secondCollapseToggle()?.click();
	});

	expect(secondViewed()?.checked).toBe(false);
	expect(
		container.querySelector<HTMLElement>('[data-file="b.txt"]')?.dataset
			.collapsed
	).toBe("true");

	act(() => {
		root.unmount();
	});
});

test("keeps repeated file entries independent in the Local Review UI", () => {
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={repeatedFilePatch}
		/>
	);
	const files = () =>
		Array.from(container.querySelectorAll<HTMLElement>('[data-file="a.txt"]'));
	const viewedControls = () =>
		Array.from(
			container.querySelectorAll<HTMLInputElement>(
				'input[aria-label="Mark a.txt viewed"]'
			)
		);

	expect(files().map((file) => file.dataset.collapsed)).toEqual([
		"false",
		"false",
	]);

	act(() => {
		viewedControls()[0]?.click();
	});

	expect(viewedControls().map((control) => control.checked)).toEqual([
		true,
		false,
	]);
	expect(files().map((file) => file.dataset.collapsed)).toEqual([
		"true",
		"false",
	]);

	act(() => {
		root.unmount();
	});
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
