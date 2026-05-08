import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import {
	reviewSessionEndpoint,
	reviewSessionShutdownEndpoint,
} from "./diffuser/protocol";
import type { ReviewSession } from "./diffuser/workflow";
import { LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD } from "./file-review-state";
import {
	App,
	ContinuousPatchDiff,
	continuousDiffViewOptions,
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

const draftCommentPatch = `diff --git a/old-name.txt b/new-name.txt
similarity index 88%
rename from old-name.txt
rename to new-name.txt
--- a/old-name.txt
+++ b/new-name.txt
@@ -1,3 +1,4 @@
 shared before
-old line
+new line
 unchanged after
+added tail
`;

const patchWithRenderedContextRows = (fileName: string, rows: number) => {
	const lines = Array.from(
		{ length: rows },
		(_, index) => ` unchanged ${fileName} ${index + 1}`
	).join("\n");

	return `diff --git a/${fileName} b/${fileName}
--- a/${fileName}
+++ b/${fileName}
@@ -1,${rows} +1,${rows} @@
${lines}
`;
};

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
	diffFileSnapshots: [],
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
		InputEvent: window.InputEvent,
		KeyboardEvent: window.KeyboardEvent,
		SVGElement: window.SVGElement,
		Event: window.Event,
		MouseEvent: window.MouseEvent,
		navigator: window.navigator,
		Node: window.Node,
		ResizeObserver: window.ResizeObserver,
	});

	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);

	act(() => {
		root.render(children);
	});

	return { container, root };
};

const flushInteractiveRender = async () => {
	await act(async () => {
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});
	});
};

const viewedControlFor = (container: Element, label: string) =>
	container.querySelector<HTMLButtonElement>(
		`button[aria-label="Mark ${label} viewed"]`
	);

const viewedControlsFor = (container: Element, label: string) =>
	Array.from(
		container.querySelectorAll<HTMLButtonElement>(
			`button[aria-label="Mark ${label} viewed"]`
		)
	);

const viewedControlPressedState = (control: HTMLButtonElement | null) =>
	control?.getAttribute("aria-pressed");

const fileProbeFor = (container: Element, fileName: string, occurrence = 0) =>
	Array.from(
		container.querySelectorAll<HTMLElement>(`[data-file="${fileName}"]`)
	)[occurrence];

const fileDraftReviewCommentCountTextFor = (
	container: Element,
	fileName: string,
	occurrence = 0
) =>
	fileProbeFor(container, fileName, occurrence)?.querySelector(
		".draft-review-comment-file-count"
	)?.textContent;

const fileHeaderMetadataFor = (
	container: Element,
	fileName: string,
	occurrence = 0
) =>
	fileProbeFor(container, fileName, occurrence)?.querySelector(
		".file-header-metadata"
	);

interface DraftReviewSelectionRange {
	readonly end: number;
	readonly endSide?: "deletions" | "additions";
	readonly side: "deletions" | "additions";
	readonly start: number;
}

interface SubmitDraftReviewCommentOptions {
	readonly fileName?: string;
	readonly occurrence?: number;
}

interface PierreDefaultHeaderProbeProps {
	readonly fileDiff: FileDiffRendererProps["fileDiff"];
	readonly fileName: string;
	readonly renderHeaderMetadata: FileDiffRendererProps["renderHeaderMetadata"];
	readonly renderHeaderPrefix: FileDiffRendererProps["renderHeaderPrefix"];
}

const PierreDefaultHeaderProbe = ({
	fileDiff,
	fileName,
	renderHeaderMetadata,
	renderHeaderPrefix,
}: PierreDefaultHeaderProbeProps) => (
	<header data-diffs-header="default">
		<div data-header-content="">
			{renderHeaderPrefix?.(fileDiff)}
			<span>{fileName}</span>
		</div>
		<div data-metadata="">
			<span data-deletions-count="">-1</span>
			<span data-additions-count="">+1</span>
			<div slot="header-metadata">{renderHeaderMetadata?.(fileDiff)}</div>
		</div>
	</header>
);

const FileDiffProbe = ({
	fileDiff,
	lineAnnotations,
	options,
	renderAnnotation,
	renderHeaderPrefix,
	renderHeaderMetadata,
}: FileDiffRendererProps) => {
	const fileName = fileDiff.name ?? "unknown";
	const collapsed = options?.collapsed ?? false;

	return (
		<article data-collapsed={String(collapsed)} data-file={fileName}>
			<PierreDefaultHeaderProbe
				fileDiff={fileDiff}
				fileName={fileName}
				renderHeaderMetadata={renderHeaderMetadata}
				renderHeaderPrefix={renderHeaderPrefix}
			/>
			{collapsed ? undefined : (
				<>
					<p>{fileName} body</p>
					<button
						aria-label="Select added line"
						onClick={() => {
							options?.onLineSelected?.({
								end: 1,
								side: "additions",
								start: 1,
							});
						}}
						type="button"
					>
						Select added line
					</button>
					{lineAnnotations?.map((annotation) => {
						const anchor =
							annotation.metadata?.anchor ??
							annotation.metadata?.comment?.anchor;

						return (
							<div
								data-anchor-line={anchor?.startLine}
								data-anchor-path={anchor?.path}
								data-anchor-side={anchor?.side}
								data-annotation-line={annotation.lineNumber}
								data-annotation-side={annotation.side}
								key={[
									annotation.side,
									annotation.lineNumber,
									annotation.metadata?.kind ?? "unknown",
									annotation.metadata?.comment?.id ?? "active",
								].join(":")}
							>
								{renderAnnotation?.(annotation)}
							</div>
						);
					})}
				</>
			)}
		</article>
	);
};

const submitDraftReviewComment = (
	container: Element,
	body: string,
	options: SubmitDraftReviewCommentOptions = {}
) => {
	const target =
		options.fileName === undefined
			? container
			: fileProbeFor(container, options.fileName, options.occurrence);

	if (target === undefined) {
		throw new Error("Draft review comment target file was not rendered.");
	}

	act(() => {
		target
			.querySelector<HTMLButtonElement>(
				'button[aria-label="Select added line"]'
			)
			?.click();
	});

	const textarea = container.querySelector<HTMLTextAreaElement>(
		'textarea[aria-label="Draft review comment"]'
	);
	if (textarea === null) {
		throw new Error("Draft review comment textarea was not rendered.");
	}

	act(() => {
		textarea.value = body;
		textarea.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
	});
	act(() => {
		textarea
			.closest("form")
			?.dispatchEvent(
				new window.Event("submit", { bubbles: true, cancelable: true })
			);
	});
};

const renderDraftReviewCommentProbe = () => {
	let currentFileDiff: FileDiffRendererProps | undefined;
	const CapturingFileDiffProbe = (props: FileDiffRendererProps) => {
		currentFileDiff = props;

		return <FileDiffProbe {...props} />;
	};
	const rendered = renderInteractive(
		<ContinuousPatchDiff
			DiffRenderer={CapturingFileDiffProbe}
			patch={draftCommentPatch}
		/>
	);
	const draftTextarea = () =>
		rendered.container.querySelector<HTMLTextAreaElement>(
			'textarea[aria-label="Draft review comment"]'
		);
	const draftTitle = () =>
		rendered.container.querySelector<HTMLHeadingElement>(
			".draft-review-comment-title"
		);
	const selectLines = (range: DraftReviewSelectionRange) => {
		act(() => {
			currentFileDiff?.options?.onLineSelected?.(range);
		});
	};
	const submitDraft = (comment: string) => {
		const textarea = draftTextarea();
		const submit = rendered.container.querySelector<HTMLButtonElement>(
			'button[aria-label="Submit draft review comment"]'
		);

		if (textarea === null || submit === null) {
			throw new Error("Expected an open Draft Review Comment form.");
		}

		textarea.value = comment;
		textarea.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
		act(() => {
			submit.click();
		});
	};
	const cancelDraft = () => {
		act(() => {
			rendered.container
				.querySelector<HTMLButtonElement>(
					'button[aria-label="Cancel draft review comment"]'
				)
				?.click();
		});
	};
	const discardDraft = (comment: string) => {
		const discardButton = Array.from(
			rendered.container.querySelectorAll<HTMLButtonElement>(
				'button[aria-label="Discard draft review comment"]'
			)
		).find((button) =>
			button.closest(".draft-review-comment")?.textContent?.includes(comment)
		);

		act(() => {
			discardButton?.click();
		});
	};
	const commentTexts = () =>
		Array.from(
			rendered.container.querySelectorAll(".draft-review-comment")
		).map((comment) => comment.textContent ?? "");

	return {
		...rendered,
		cancelDraft,
		commentTexts,
		currentFileDiff: () => currentFileDiff,
		discardDraft,
		draftTitle,
		draftTextarea,
		selectLines,
		submitDraft,
	};
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

test("rejects malformed Session Endpoint payloads before rendering", async () => {
	await expect(
		loadReviewSession(() =>
			Promise.resolve(
				Response.json({
					id: "diff-2026-05-08T02:41:00.000Z",
					mode: "read-only",
					kind: "diff",
				})
			)
		)
	).rejects.toThrow("Session Endpoint payload is invalid.");
});

test("notifies the One-shot Server when the Local Review UI unloads", () => {
	const shutdownRequests: string[] = [];
	const { root } = renderInteractive(<App initialSession={reviewSession()} />);
	Object.defineProperty(window.navigator, "sendBeacon", {
		configurable: true,
		value: (url: string) => {
			shutdownRequests.push(url);

			return true;
		},
	});

	act(() => {
		window.dispatchEvent(new window.Event("pagehide"));
	});

	expect(shutdownRequests).toEqual([reviewSessionShutdownEndpoint]);

	act(() => {
		root.unmount();
	});
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

test("renders the Continuous Diff View in a dedicated full-width region", () => {
	const html = renderReviewSession(
		reviewSession({
			patch: multiFilePatch,
		})
	);

	expect(html).toContain('<main class="review-app">');
	expect(html).toContain('<header class="review-header">');
	expect(html).toContain('<section aria-label="Patch" class="review-patch">');
});

test("configures Pierre hunk affordances for the Continuous Diff View", () => {
	expect(continuousDiffViewOptions).toEqual({
		diffStyle: "split",
		hunkSeparators: "line-info-basic",
	});
});

test("enriches Patch file entries with Diff File Snapshots for expandable hunk context", () => {
	const patch = `diff --git a/file.txt b/file.txt
index 1111111..2222222 100644
--- a/file.txt
+++ b/file.txt
@@ -3 +3 @@
-old
+new
`;
	const renderedFileDiffs: FileDiffRendererProps["fileDiff"][] = [];

	renderToStaticMarkup(
		<ContinuousPatchDiff
			DiffRenderer={({ fileDiff }) => {
				renderedFileDiffs.push(fileDiff);
				return <article>{fileDiff.name}</article>;
			}}
			diffFileSnapshots={[
				{
					status: "available",
					oldFile: { name: "file.txt", contents: "one\ntwo\nold\nfour\n" },
					newFile: { name: "file.txt", contents: "one\ntwo\nnew\nfour\n" },
				},
			]}
			patch={patch}
		/>
	);

	expect(renderedFileDiffs).toHaveLength(1);
	expect(renderedFileDiffs[0]?.isPartial).toBe(false);
	expect(renderedFileDiffs[0]?.deletionLines).toEqual([
		"one\n",
		"two\n",
		"old\n",
		"four\n",
	]);
	expect(renderedFileDiffs[0]?.additionLines).toEqual([
		"one\n",
		"two\n",
		"new\n",
		"four\n",
	]);
	expect(renderedFileDiffs[0]?.hunks[0]?.collapsedBefore).toBe(2);
});

test("aligns multi-file Diff File Snapshots by Patch order in the Continuous Diff View", () => {
	const patch = `diff --git a/first.txt b/first.txt
index 1111111..2222222 100644
--- a/first.txt
+++ b/first.txt
@@ -2 +2 @@
-first old
+first new
diff --git a/middle.txt b/middle.txt
index 3333333..4444444 100644
--- a/middle.txt
+++ b/middle.txt
@@ -2 +2 @@
-middle old
+middle new
diff --git a/third.txt b/third.txt
index 5555555..6666666 100644
--- a/third.txt
+++ b/third.txt
@@ -2 +2 @@
-third old
+third new
`;
	const renderedFileDiffs: FileDiffRendererProps["fileDiff"][] = [];

	renderToStaticMarkup(
		<ContinuousPatchDiff
			DiffRenderer={({ fileDiff }) => {
				renderedFileDiffs.push(fileDiff);
				return <article>{fileDiff.name}</article>;
			}}
			diffFileSnapshots={[
				{
					status: "available",
					oldFile: {
						name: "first.txt",
						contents: "first context\nfirst old\n",
					},
					newFile: {
						name: "first.txt",
						contents: "first context\nfirst new\n",
					},
				},
				{
					status: "unavailable",
					reason: "Middle file content is unavailable",
				},
				{
					status: "available",
					oldFile: {
						name: "third.txt",
						contents: "third context\nthird old\n",
					},
					newFile: {
						name: "third.txt",
						contents: "third context\nthird new\n",
					},
				},
			]}
			patch={patch}
		/>
	);

	expect(renderedFileDiffs).toHaveLength(3);
	expect(renderedFileDiffs[0]?.name).toBe("first.txt");
	expect(renderedFileDiffs[0]?.isPartial).toBe(false);
	expect(renderedFileDiffs[0]?.deletionLines).toEqual([
		"first context\n",
		"first old\n",
	]);
	expect(renderedFileDiffs[1]?.name).toBe("middle.txt");
	expect(renderedFileDiffs[1]?.isPartial).toBe(true);
	expect(renderedFileDiffs[2]?.name).toBe("third.txt");
	expect(renderedFileDiffs[2]?.isPartial).toBe(false);
	expect(renderedFileDiffs[2]?.additionLines).toEqual([
		"third context\n",
		"third new\n",
	]);
});

test("expands collapsed unchanged hunk labels when Diff File Snapshots are available", async () => {
	const unchangedPrefix = Array.from(
		{ length: 21 },
		(_, index) => `context line ${index + 1}`
	);
	const oldLines = [...unchangedPrefix, "old value", "after value"];
	const newLines = [...unchangedPrefix, "new value", "after value"];
	const patch = `diff --git a/file.txt b/file.txt
index 1111111..2222222 100644
--- a/file.txt
+++ b/file.txt
@@ -20,4 +20,4 @@
 context line 20
 context line 21
-old value
+new value
 after value
`;
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff
			diffFileSnapshots={[
				{
					status: "available",
					oldFile: { name: "file.txt", contents: `${oldLines.join("\n")}\n` },
					newFile: { name: "file.txt", contents: `${newLines.join("\n")}\n` },
				},
			]}
			patch={patch}
		/>
	);
	const fileContainer = container.querySelector("diffs-container");
	await flushInteractiveRender();
	const shadowRoot = fileContainer?.shadowRoot;
	const collapsedLabel = shadowRoot?.querySelector<HTMLElement>(
		"[data-unmodified-lines]"
	);

	expect(collapsedLabel?.textContent).toBe("19 unmodified lines");
	expect(shadowRoot?.textContent).not.toContain("context line 1");

	act(() => {
		collapsedLabel?.click();
	});
	await flushInteractiveRender();

	expect(shadowRoot?.textContent).toContain("context line 1");

	act(() => {
		root.unmount();
	});
});

test("expands collapsed unchanged hunk labels between changed regions", async () => {
	const unchangedMiddle = Array.from(
		{ length: 17 },
		(_, index) => `middle context line ${index + 1}`
	);
	const oldLines = [
		"first old",
		"shared prefix",
		...unchangedMiddle,
		"shared suffix",
		"second old",
	];
	const newLines = [
		"first new",
		"shared prefix",
		...unchangedMiddle,
		"shared suffix",
		"second new",
	];
	const patch = `diff --git a/file.txt b/file.txt
index 1111111..2222222 100644
--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
-first old
+first new
 shared prefix
@@ -19,3 +19,3 @@
 middle context line 17
 shared suffix
-second old
+second new
`;
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff
			diffFileSnapshots={[
				{
					status: "available",
					oldFile: { name: "file.txt", contents: `${oldLines.join("\n")}\n` },
					newFile: { name: "file.txt", contents: `${newLines.join("\n")}\n` },
				},
			]}
			patch={patch}
		/>
	);
	const fileContainer = container.querySelector("diffs-container");
	await flushInteractiveRender();
	const shadowRoot = fileContainer?.shadowRoot;
	const collapsedLabel = Array.from(
		shadowRoot?.querySelectorAll<HTMLElement>("[data-unmodified-lines]") ?? []
	).find((label) => label.textContent === "16 unmodified lines");

	expect(collapsedLabel?.textContent).toBe("16 unmodified lines");
	expect(shadowRoot?.textContent).not.toContain("middle context line 5");

	act(() => {
		collapsedLabel?.click();
	});
	await flushInteractiveRender();

	expect(shadowRoot?.textContent).toContain("middle context line 5");

	act(() => {
		root.unmount();
	});
});

test("groups file header metadata controls with Pierre header metadata", () => {
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff DiffRenderer={FileDiffProbe} patch={multiFilePatch} />
	);
	const aMetadata = () => fileHeaderMetadataFor(container, "a.txt");
	const bMetadata = () => fileHeaderMetadataFor(container, "b.txt");
	const initialAMetadata = aMetadata();
	const initialBMetadata = bMetadata();

	expect(initialAMetadata).not.toBeNull();
	expect(initialAMetadata?.textContent).toContain("Viewed");
	expect(
		initialAMetadata?.querySelector(".draft-review-comment-file-count")
	).toBeNull();
	expect(initialBMetadata).not.toBeNull();

	submitDraftReviewComment(
		container,
		"Align this count with the viewed control.",
		{
			fileName: "a.txt",
		}
	);
	const commentedAMetadata = aMetadata();
	const uncommentedBMetadata = bMetadata();

	expect(commentedAMetadata?.textContent).toContain("1 comment");
	expect(commentedAMetadata?.textContent).toContain("Viewed");
	expect(
		commentedAMetadata?.querySelector<HTMLButtonElement>(
			'button[aria-label="Mark a.txt viewed"]'
		)
	).not.toBeNull();
	expect(
		uncommentedBMetadata?.querySelector(".draft-review-comment-file-count")
	).toBeNull();

	act(() => {
		root.unmount();
	});
});

test("keeps viewed and collapsed file state independent in the Local Review UI", () => {
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff DiffRenderer={FileDiffProbe} patch={multiFilePatch} />
	);
	const file = () =>
		container.querySelector<HTMLElement>('[data-file="a.txt"]');
	const viewed = () => viewedControlFor(container, "a.txt");
	const secondViewed = () => viewedControlFor(container, "b.txt");
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
	).toHaveLength(0);
	expect(viewed()?.textContent).toContain("Viewed");
	expect(viewedControlPressedState(viewed())).toBe("false");
	expect(file()?.dataset.collapsed).toBe("false");
	expect(container.textContent).toContain("a.txt body");

	act(() => {
		viewed()?.click();
	});

	expect(viewedControlPressedState(viewed())).toBe("true");
	expect(file()?.dataset.collapsed).toBe("true");
	expect(container.textContent).not.toContain("a.txt body");

	act(() => {
		collapseToggle()?.click();
	});

	expect(viewedControlPressedState(viewed())).toBe("true");
	expect(file()?.dataset.collapsed).toBe("false");
	expect(container.textContent).toContain("a.txt body");

	act(() => {
		collapseToggle()?.click();
	});
	act(() => {
		viewed()?.click();
	});

	expect(viewedControlPressedState(viewed())).toBe("false");
	expect(file()?.dataset.collapsed).toBe("true");

	act(() => {
		secondCollapseToggle()?.click();
	});

	expect(viewedControlPressedState(secondViewed())).toBe("false");
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
	const viewedControls = () => viewedControlsFor(container, "a.txt");

	expect(files().map((file) => file.dataset.collapsed)).toEqual([
		"false",
		"false",
	]);

	act(() => {
		viewedControls()[0]?.click();
	});

	expect(
		viewedControls().map((control) => viewedControlPressedState(control))
	).toEqual(["true", "false"]);
	expect(files().map((file) => file.dataset.collapsed)).toEqual([
		"true",
		"false",
	]);

	act(() => {
		root.unmount();
	});
});

test("submits and copies Draft Review Comments from the Local Review UI", async () => {
	const clipboardWrites: string[] = [];
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff DiffRenderer={FileDiffProbe} patch={multiFilePatch} />
	);
	Object.defineProperty(window.navigator, "clipboard", {
		configurable: true,
		value: {
			writeText: (text: string) => {
				clipboardWrites.push(text);

				return Promise.resolve();
			},
		},
	});

	submitDraftReviewComment(container, "Please simplify this branch.");

	expect(container.textContent).toContain("Please simplify this branch.");
	expect(container.textContent).toContain("1 draft comment");
	expect(container.textContent).toContain("1 comment");
	expect(
		container.querySelector<HTMLElement>("[data-annotation-side]")?.dataset
			.annotationSide
	).toBe("additions");

	await act(async () => {
		container
			.querySelector<HTMLButtonElement>('button[aria-label="Copy review"]')
			?.click();
		await Promise.resolve();
	});

	expect(clipboardWrites).toEqual([
		`a.txt:1 [new]
Please simplify this branch.`,
	]);
	expect(container.textContent).not.toContain("Please simplify this branch.");
	expect(container.textContent).not.toContain("Copy review");

	act(() => {
		root.unmount();
	});
});

test("clears all Draft Review Comments only after browser confirmation", () => {
	const confirmationMessages: string[] = [];
	const clipboardWrites: string[] = [];
	let shouldConfirm = false;
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff DiffRenderer={FileDiffProbe} patch={multiFilePatch} />
	);
	Object.defineProperty(window.navigator, "clipboard", {
		configurable: true,
		value: {
			writeText: (text: string) => {
				clipboardWrites.push(text);

				return Promise.resolve();
			},
		},
	});
	Object.defineProperty(window, "confirm", {
		configurable: true,
		value: (message: string) => {
			confirmationMessages.push(message);

			return shouldConfirm;
		},
	});
	const clearDraftReviewComments = () =>
		container.querySelector<HTMLButtonElement>(
			'button[aria-label="Clear draft review comments"]'
		);

	submitDraftReviewComment(container, "Clear this only after confirmation.");

	expect(clearDraftReviewComments()).not.toBeNull();

	act(() => {
		clearDraftReviewComments()?.click();
	});

	expect(confirmationMessages).toEqual(["Clear all draft review comments?"]);
	expect(container.textContent).toContain(
		"Clear this only after confirmation."
	);
	expect(clipboardWrites).toEqual([]);

	shouldConfirm = true;
	act(() => {
		clearDraftReviewComments()?.click();
	});

	expect(confirmationMessages).toEqual([
		"Clear all draft review comments?",
		"Clear all draft review comments?",
	]);
	expect(container.textContent).not.toContain(
		"Clear this only after confirmation."
	);
	expect(container.textContent).not.toContain("Copy review");
	expect(clipboardWrites).toEqual([]);

	act(() => {
		root.unmount();
	});
});

test("discards individual Draft Review Comments without confirmation", () => {
	const confirmationMessages: string[] = [];
	const { commentTexts, discardDraft, root, selectLines, submitDraft } =
		renderDraftReviewCommentProbe();
	Object.defineProperty(window, "confirm", {
		configurable: true,
		value: (message: string) => {
			confirmationMessages.push(message);

			return true;
		},
	});

	selectLines({ start: 2, end: 2, side: "additions" });
	submitDraft("Discard this single comment quickly.");
	discardDraft("Discard this single comment quickly.");

	expect(commentTexts()).toEqual([]);
	expect(confirmationMessages).toEqual([]);

	act(() => {
		root.unmount();
	});
});

test("surfaces per-file Draft Review Comment counts independently from viewed and collapsed state", () => {
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff DiffRenderer={FileDiffProbe} patch={multiFilePatch} />
	);
	Object.defineProperty(window, "confirm", {
		configurable: true,
		value: () => true,
	});
	const aFile = () => fileProbeFor(container, "a.txt");
	const bFile = () => fileProbeFor(container, "b.txt");
	const aViewed = () => viewedControlFor(container, "a.txt");
	const bViewed = () => viewedControlFor(container, "b.txt");
	const aCollapseToggle = () =>
		container.querySelector<HTMLButtonElement>(
			'button[aria-label="Toggle a.txt collapsed"]'
		);
	const bCollapseToggle = () =>
		container.querySelector<HTMLButtonElement>(
			'button[aria-label="Toggle b.txt collapsed"]'
		);
	const clearDraftReviewComments = () =>
		container.querySelector<HTMLButtonElement>(
			'button[aria-label="Clear draft review comments"]'
		);

	expect(
		fileDraftReviewCommentCountTextFor(container, "a.txt")
	).toBeUndefined();
	expect(
		fileDraftReviewCommentCountTextFor(container, "b.txt")
	).toBeUndefined();

	submitDraftReviewComment(container, "First file concern.", {
		fileName: "a.txt",
	});

	expect(fileDraftReviewCommentCountTextFor(container, "a.txt")).toBe(
		"1 comment"
	);
	expect(
		fileDraftReviewCommentCountTextFor(container, "b.txt")
	).toBeUndefined();
	expect(viewedControlPressedState(aViewed())).toBe("false");
	expect(aFile()?.dataset.collapsed).toBe("false");

	act(() => {
		aViewed()?.click();
	});

	expect(fileDraftReviewCommentCountTextFor(container, "a.txt")).toBe(
		"1 comment"
	);
	expect(viewedControlPressedState(aViewed())).toBe("true");
	expect(aFile()?.dataset.collapsed).toBe("true");

	submitDraftReviewComment(container, "Second file concern.", {
		fileName: "b.txt",
	});

	expect(fileDraftReviewCommentCountTextFor(container, "a.txt")).toBe(
		"1 comment"
	);
	expect(fileDraftReviewCommentCountTextFor(container, "b.txt")).toBe(
		"1 comment"
	);
	expect(container.textContent).toContain("2 draft comments");
	expect(viewedControlPressedState(bViewed())).toBe("false");
	expect(bFile()?.dataset.collapsed).toBe("false");

	act(() => {
		bCollapseToggle()?.click();
	});

	expect(fileDraftReviewCommentCountTextFor(container, "b.txt")).toBe(
		"1 comment"
	);
	expect(viewedControlPressedState(bViewed())).toBe("false");
	expect(bFile()?.dataset.collapsed).toBe("true");

	act(() => {
		clearDraftReviewComments()?.click();
	});

	expect(
		fileDraftReviewCommentCountTextFor(container, "a.txt")
	).toBeUndefined();
	expect(
		fileDraftReviewCommentCountTextFor(container, "b.txt")
	).toBeUndefined();
	expect(viewedControlPressedState(aViewed())).toBe("true");
	expect(aFile()?.dataset.collapsed).toBe("true");
	expect(viewedControlPressedState(bViewed())).toBe("false");
	expect(bFile()?.dataset.collapsed).toBe("true");
	expect(container.textContent).not.toContain("Copy review");

	act(() => {
		aCollapseToggle()?.click();
	});

	expect(viewedControlPressedState(aViewed())).toBe("true");
	expect(aFile()?.dataset.collapsed).toBe("false");

	act(() => {
		root.unmount();
	});
});

test("supports side-aware inline Draft Review Comments in the Local Review UI", () => {
	const {
		cancelDraft,
		commentTexts,
		container,
		currentFileDiff,
		discardDraft,
		draftTextarea,
		root,
		selectLines,
		submitDraft,
	} = renderDraftReviewCommentProbe();

	expect(currentFileDiff()?.options?.enableLineSelection).toBe(true);

	selectLines({ start: 2, end: 2, side: "additions" });
	expect(draftTextarea()).not.toBeNull();
	cancelDraft();
	expect(container.querySelector(".draft-review-comment")).toBeNull();
	expect(currentFileDiff()?.selectedLines).toBeNull();

	selectLines({ start: 2, end: 2, side: "additions" });
	submitDraft("   ");
	expect(container.querySelector(".draft-review-comment")).toBeNull();

	selectLines({ start: 4, end: 2, side: "additions" });
	submitDraft("Please check the new flow.");
	selectLines({ start: 4, end: 2, side: "additions" });
	submitDraft("A second note for the same range.");
	expect(commentTexts()).toHaveLength(2);
	expect(commentTexts()[0]).toContain("new-name.txt:2-4 [new]");
	expect(commentTexts()[0]).toContain("Please check the new flow.");
	expect(commentTexts()[1]).toContain("new-name.txt:2-4 [new]");
	expect(commentTexts()[1]).toContain("A second note for the same range.");
	expect(
		Array.from(container.querySelectorAll("[data-anchor-path]")).map(
			(annotation) => [
				annotation.getAttribute("data-anchor-path"),
				annotation.getAttribute("data-anchor-side"),
				annotation.getAttribute("data-anchor-line"),
				annotation.getAttribute("data-annotation-side"),
				annotation.getAttribute("data-annotation-line"),
			]
		)
	).toEqual([
		["new-name.txt", "new", "2", "additions", "4"],
		["new-name.txt", "new", "2", "additions", "4"],
	]);

	discardDraft("Please check the new flow.");
	expect(commentTexts()).toHaveLength(1);
	expect(commentTexts()[0]).toContain("new-name.txt:2-4 [new]");
	expect(commentTexts()[0]).toContain("A second note for the same range.");

	selectLines({ start: 2, end: 2, side: "deletions" });
	submitDraft("Deleted line concern.");
	selectLines({ start: 3, end: 3, side: "deletions" });
	submitDraft("Context should anchor to the new side.");
	expect(commentTexts()).toHaveLength(3);
	expect(commentTexts()[0]).toContain("new-name.txt:2-4 [new]");
	expect(commentTexts()[0]).toContain("A second note for the same range.");
	expect(commentTexts()[1]).toContain("old-name.txt:2 [old/deleted]");
	expect(commentTexts()[1]).toContain("Deleted line concern.");
	expect(commentTexts()[2]).toContain("new-name.txt:3 [new]");
	expect(commentTexts()[2]).toContain("Context should anchor to the new side.");

	selectLines({ start: 2, end: 2, side: "deletions", endSide: "additions" });
	expect(
		container.querySelector('textarea[aria-label="Draft review comment"]')
	).toBeNull();

	act(() => {
		root.unmount();
	});
});

test("polishes Draft Review Comment form title and keyboard submission", () => {
	const { commentTexts, draftTextarea, draftTitle, root, selectLines } =
		renderDraftReviewCommentProbe();

	selectLines({ start: 2, end: 2, side: "additions" });
	expect(draftTitle()?.tagName).toBe("H3");
	expect(draftTitle()?.textContent).toBe("Add a comment on line R2");
	expect(draftTitle()?.textContent).not.toContain("new-name.txt");

	selectLines({ start: 4, end: 2, side: "additions" });
	expect(draftTitle()?.textContent).toBe("Add a comment on lines R2 to R4");

	selectLines({ start: 2, end: 2, side: "deletions" });
	expect(draftTitle()?.textContent).toBe("Add a comment on line L2");
	expect(draftTitle()?.textContent).not.toContain("old-deleted");

	const textarea = draftTextarea();
	if (textarea === null) {
		throw new Error("Expected an open Draft Review Comment form.");
	}
	const updateDraftBody = (body: string) => {
		textarea.value = body;
		textarea.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
	};
	const pressEnterInDraft = (eventInit: KeyboardEventInit = {}) =>
		textarea.dispatchEvent(
			new window.KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				key: "Enter",
				...eventInit,
			})
		);

	updateDraftBody("Plain Enter stays editable.");
	const plainEnterWasAllowed = pressEnterInDraft();
	expect(plainEnterWasAllowed).toBe(true);
	expect(draftTextarea()).toBe(textarea);
	expect(commentTexts()).toHaveLength(0);

	updateDraftBody("Submit from the keyboard.");
	act(() => {
		pressEnterInDraft({ metaKey: true });
	});

	expect(commentTexts()).toHaveLength(1);
	expect(commentTexts()[0]).toContain("Submit from the keyboard.");

	act(() => {
		root.unmount();
	});
});

test("keeps Draft Review Comments when copying fails", async () => {
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff DiffRenderer={FileDiffProbe} patch={multiFilePatch} />
	);
	Object.defineProperty(window.navigator, "clipboard", {
		configurable: true,
		value: {
			writeText: () => Promise.reject(new Error("Clipboard blocked.")),
		},
	});

	submitDraftReviewComment(container, "Do not lose this.");

	await act(async () => {
		container
			.querySelector<HTMLButtonElement>('button[aria-label="Copy review"]')
			?.click();
		await Promise.resolve();
	});

	expect(container.textContent).toContain("Do not lose this.");
	expect(container.textContent).toContain("Could not copy review.");

	act(() => {
		root.unmount();
	});
});

test("keeps Draft Review Comments when clipboard copying is unavailable", async () => {
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff DiffRenderer={FileDiffProbe} patch={multiFilePatch} />
	);
	Object.defineProperty(window.navigator, "clipboard", {
		configurable: true,
		value: undefined,
	});

	submitDraftReviewComment(container, "Keep this without clipboard access.");

	await act(async () => {
		container
			.querySelector<HTMLButtonElement>('button[aria-label="Copy review"]')
			?.click();
		await Promise.resolve();
	});

	expect(container.textContent).toContain(
		"Keep this without clipboard access."
	);
	expect(container.textContent).toContain("Could not copy review.");

	act(() => {
		root.unmount();
	});
});

test("rejects Draft Review Comment ranges that normalize across anchor sides", () => {
	const { currentFileDiff, draftTextarea, root, selectLines } =
		renderDraftReviewCommentProbe();

	selectLines({ start: 2, end: 2, side: "additions" });
	expect(draftTextarea()).not.toBeNull();

	selectLines({ start: 2, end: 3, side: "deletions" });
	expect(draftTextarea()).toBeNull();
	expect(currentFileDiff()?.selectedLines).toBeNull();

	act(() => {
		root.unmount();
	});
});

test("default-collapses large rendered file diffs without marking them viewed", () => {
	const largePatch = patchWithRenderedContextRows(
		"large.txt",
		LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD + 1
	);
	const thresholdPatch = patchWithRenderedContextRows(
		"threshold.txt",
		LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD
	);
	const smallPatch = patchWithRenderedContextRows(
		"small.txt",
		LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD - 1
	);
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff DiffRenderer={FileDiffProbe} patch={largePatch} />
	);
	const largeFile = () =>
		container.querySelector<HTMLElement>('[data-file="large.txt"]');
	const largeViewed = () => viewedControlFor(container, "large.txt");
	const largeCollapseToggle = () =>
		container.querySelector<HTMLButtonElement>(
			'button[aria-label="Toggle large.txt collapsed"]'
		);

	expect(largeFile()?.dataset.collapsed).toBe("true");
	expect(viewedControlPressedState(largeViewed())).toBe("false");
	expect(container.textContent).not.toContain("large.txt body");

	act(() => {
		largeCollapseToggle()?.click();
	});

	expect(largeFile()?.dataset.collapsed).toBe("false");
	expect(viewedControlPressedState(largeViewed())).toBe("false");
	expect(container.textContent).toContain("large.txt body");

	act(() => {
		root.render(
			<ContinuousPatchDiff
				DiffRenderer={FileDiffProbe}
				patch={thresholdPatch}
			/>
		);
	});

	const thresholdFile = () =>
		container.querySelector<HTMLElement>('[data-file="threshold.txt"]');
	const thresholdViewed = () => viewedControlFor(container, "threshold.txt");

	expect(thresholdFile()?.dataset.collapsed).toBe("false");
	expect(viewedControlPressedState(thresholdViewed())).toBe("false");
	expect(container.textContent).toContain("threshold.txt body");

	act(() => {
		root.render(
			<ContinuousPatchDiff DiffRenderer={FileDiffProbe} patch={smallPatch} />
		);
	});

	const smallFile = () =>
		container.querySelector<HTMLElement>('[data-file="small.txt"]');
	const smallViewed = () => viewedControlFor(container, "small.txt");

	expect(smallFile()?.dataset.collapsed).toBe("false");
	expect(viewedControlPressedState(smallViewed())).toBe("false");
	expect(container.textContent).toContain("small.txt body");

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
