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
import {
	App,
	ContinuousPatchDiff,
	continuousDiffViewOptions,
	type FileDiffRendererProps,
	LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD,
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
			<header>
				{renderHeaderPrefix?.(fileDiff)}
				<span>{fileName}</span>
				{renderHeaderMetadata?.(fileDiff)}
			</header>
			{collapsed ? undefined : (
				<>
					<p>{fileName} body</p>
					<button
						aria-label="Select added line"
						onClick={() => {
							options?.onLineSelectionEnd?.({
								end: 1,
								side: "additions",
								start: 1,
							});
						}}
						type="button"
					>
						Select added line
					</button>
					{lineAnnotations?.map((annotation) => (
						<div
							data-anchor-line={annotation.metadata?.anchor.startLine}
							data-anchor-path={annotation.metadata?.anchor.path}
							data-anchor-side={annotation.metadata?.anchor.side}
							data-annotation-line={annotation.lineNumber}
							data-annotation-side={annotation.side}
							key={[
								annotation.side,
								annotation.lineNumber,
								annotation.metadata?.kind ?? "unknown",
								annotation.metadata?.kind === "comment"
									? annotation.metadata.comment.id
									: "active",
							].join(":")}
						>
							{renderAnnotation?.(annotation)}
						</div>
					))}
				</>
			)}
		</article>
	);
};

const submitDraftReviewComment = (container: Element, body: string) => {
	act(() => {
		container
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

test("supports side-aware inline Draft Review Comments in the Local Review UI", () => {
	let currentFileDiff: FileDiffRendererProps | undefined;
	const CapturingFileDiffProbe = (props: FileDiffRendererProps) => {
		currentFileDiff = props;

		return <FileDiffProbe {...props} />;
	};
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff
			DiffRenderer={CapturingFileDiffProbe}
			patch={draftCommentPatch}
		/>
	);
	const selectLines = (range: {
		readonly start: number;
		readonly end: number;
		readonly side: "deletions" | "additions";
		readonly endSide?: "deletions" | "additions";
	}) => {
		act(() => {
			currentFileDiff?.options?.onLineSelectionEnd?.(range);
		});
	};
	const submitDraft = (comment: string) => {
		const textarea = container.querySelector<HTMLTextAreaElement>(
			'textarea[aria-label="Draft review comment"]'
		);
		const submit = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Submit draft review comment"]'
		);

		if (textarea === null || submit === null) {
			throw new Error("Expected an open Draft Review Comment form.");
		}

		textarea.value = comment;
		act(() => {
			submit.click();
		});
	};
	const cancelDraft = () => {
		act(() => {
			container
				.querySelector<HTMLButtonElement>(
					'button[aria-label="Cancel draft review comment"]'
				)
				?.click();
		});
	};
	const discardDraft = (comment: string) => {
		const discardButton = Array.from(
			container.querySelectorAll<HTMLButtonElement>(
				'button[aria-label="Discard draft review comment"]'
			)
		).find((button) =>
			button.closest("[data-draft-comment]")?.textContent?.includes(comment)
		);

		act(() => {
			discardButton?.click();
		});
	};
	const commentTexts = () =>
		Array.from(container.querySelectorAll("[data-draft-comment]")).map(
			(comment) => comment.textContent ?? ""
		);

	expect(currentFileDiff?.options?.enableLineSelection).toBe(true);

	selectLines({ start: 2, end: 2, side: "additions" });
	expect(
		container.querySelector('textarea[aria-label="Draft review comment"]')
	).not.toBeNull();
	cancelDraft();
	expect(container.querySelector("[data-draft-comment]")).toBeNull();
	expect(currentFileDiff?.selectedLines).toBeNull();

	selectLines({ start: 2, end: 2, side: "additions" });
	submitDraft("   ");
	expect(container.querySelector("[data-draft-comment]")).toBeNull();

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
