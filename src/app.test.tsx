import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { createContinuousDiffViewInteraction } from "./continuous-diff-view-interaction";
import {
	reviewSessionEndpoint,
	reviewSessionShutdownEndpoint,
} from "./diffuser/protocol";
import type { ReviewSession } from "./diffuser/workflow";
import {
	clearDraftReviewCommentsConfirmationMessage,
	copyReviewErrorMessage,
} from "./draft-review-comment-copy-clear-policy";
import { LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD } from "./file-review-state";
import { patchFileNavigatorModelFor } from "./patch-file-navigator";
import { PatchFileNavigatorSidebar } from "./patch-file-navigator-view";
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

const navigatorPatch = `${patchWithRenderedContextRows(
	"large.txt",
	LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD + 1
)}${patchWithRenderedContextRows("src/target.ts", 1)}`;

const navigatorMetadataPatch = `diff --git a/src/alpha.ts b/src/alpha.ts
--- a/src/alpha.ts
+++ b/src/alpha.ts
@@ -1 +1 @@
-old
+new
diff --git a/src/beta.ts b/src/beta.ts
new file mode 100644
--- /dev/null
+++ b/src/beta.ts
@@ -0,0 +1 @@
+created
diff --git a/src/gamma.ts b/src/gamma.ts
deleted file mode 100644
--- a/src/gamma.ts
+++ /dev/null
@@ -1 +0,0 @@
-removed
diff --git a/old-name.ts b/src/delta.ts
similarity index 100%
rename from old-name.ts
rename to src/delta.ts
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

const renderInCurrentInteractiveWindow = (children: ReactNode) => {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);

	act(() => {
		root.render(children);
	});

	return { container, root };
};

const installInteractiveWindow = () => {
	const window = new Window({ url: "http://localhost" });
	window.SyntaxError = SyntaxError;

	Object.assign(globalThis, {
		IS_REACT_ACT_ENVIRONMENT: true,
		window,
		document: window.document,
		HTMLElement: window.HTMLElement,
		HTMLDivElement: window.HTMLDivElement,
		HTMLTemplateElement: window.HTMLTemplateElement,
		HTMLStyleElement: window.HTMLStyleElement,
		HTMLInputElement: window.HTMLInputElement,
		InputEvent: window.InputEvent,
		KeyboardEvent: window.KeyboardEvent,
		SVGElement: window.SVGElement,
		Event: window.Event,
		MouseEvent: window.MouseEvent,
		navigator: window.navigator,
		Node: window.Node,
		ResizeObserver: window.ResizeObserver,
		ShadowRoot: window.ShadowRoot,
	});
};

const renderInteractive = (children: ReactNode) => {
	installInteractiveWindow();

	return renderInCurrentInteractiveWindow(children);
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

interface ClipboardStub {
	readonly writeText: (text: string) => Promise<void>;
}

const stubClipboard = (clipboard: ClipboardStub | undefined) => {
	Object.defineProperty(window.navigator, "clipboard", {
		configurable: true,
		value: clipboard,
	});
};

const copyReviewButtonFor = (container: Element) =>
	container.querySelector<HTMLButtonElement>(
		'button[aria-label="Copy review"]'
	);

const clickCopyReview = async (container: Element) => {
	await act(async () => {
		copyReviewButtonFor(container)?.click();
		await Promise.resolve();
	});
};

const discardDraftReviewCommentContaining = (
	container: Element,
	bodySubstring: string
) => {
	const discardButtons = Array.from(
		container.querySelectorAll<HTMLButtonElement>(
			'button[aria-label="Discard draft review comment"]'
		)
	);
	const matchingDiscard = discardButtons.find((button) => {
		const draftCommentRoot = button.closest(".draft-review-comment");

		return draftCommentRoot?.textContent?.includes(bodySubstring) ?? false;
	});

	act(() => {
		matchingDiscard?.click();
	});
};

const clearDraftReviewCommentsButtonFor = (container: Element) =>
	container.querySelector<HTMLButtonElement>(
		'button[aria-label="Clear draft review comments"]'
	);

const fileProbeFor = (container: Element, fileName: string, occurrence = 0) =>
	Array.from(
		container.querySelectorAll<HTMLElement>(`[data-file="${fileName}"]`)
	)[occurrence];

const fileCollapseToggleFor = (
	container: Element,
	fileName: string,
	occurrence = 0
) =>
	fileProbeFor(
		container,
		fileName,
		occurrence
	)?.querySelector<HTMLButtonElement>(
		'button[aria-label="Collapse file"], button[aria-label="Expand file"]'
	);

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

const patchNavigatorShadowRootFor = (container: Element) =>
	container.querySelector<HTMLElement>('[aria-label="Patch File Navigator"]')
		?.shadowRoot;

const patchNavigatorRowFor = (container: Element, path: string) =>
	Array.from(
		patchNavigatorShadowRootFor(container)?.querySelectorAll<HTMLButtonElement>(
			"[data-item-path]"
		) ?? []
	).find((row) => row.getAttribute("data-item-path") === path) ?? null;

const patchNavigatorFileRowFor = (container: Element, path: string) => {
	const row = patchNavigatorRowFor(container, path);

	return row?.getAttribute("data-item-type") === "file" ? row : null;
};

const patchNavigatorSearchInputFor = (container: Element) =>
	patchNavigatorShadowRootFor(container)?.querySelector<HTMLInputElement>(
		"[data-file-tree-search-input]"
	) ?? null;

const waitForPatchNavigatorRender = async () => {
	await act(async () => {
		await Promise.resolve();
	});
};

const clickPatchNavigatorFileRow = async (container: Element, path: string) => {
	await act(async () => {
		patchNavigatorFileRowFor(container, path)?.click();
		await Promise.resolve();
	});
};

const enterPatchNavigatorSearchQuery = async (
	searchInput: HTMLInputElement,
	query: string
) => {
	await act(async () => {
		searchInput.value = query;
		searchInput.dispatchEvent(
			new window.InputEvent("input", { bubbles: true })
		);
		await Promise.resolve();
	});
};

const isPatchNavigatorFileRowSelected = (container: Element, path: string) =>
	patchNavigatorFileRowFor(container, path)?.hasAttribute(
		"data-item-selected"
	) ?? false;

const stubScrollIntoView = (
	scrollIntoView: typeof window.HTMLElement.prototype.scrollIntoView
) => {
	const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;

	Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
		configurable: true,
		value: scrollIntoView,
	});

	return () => {
		Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
			configurable: true,
			value: originalScrollIntoView,
		});
	};
};

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

test("renders only the diff target in the Review Header", () => {
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

	expect(html).toContain("diffuser diff --staged");
	expect(html).not.toContain("Diffuser Review");
	expect(html).not.toContain("/repo/packages/app");
	expect(html).not.toContain("Captured");
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
	const collapseToggle = () => fileCollapseToggleFor(container, "a.txt");
	const secondCollapseToggle = () => fileCollapseToggleFor(container, "b.txt");

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
	stubClipboard({
		writeText: (text) => {
			clipboardWrites.push(text);

			return Promise.resolve();
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

	await clickCopyReview(container);

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

test("restores submitted Draft Review Comments for the same Repository Context and Patch", () => {
	const repositoryContext = reviewSession().context.repository;
	const firstRender = renderInteractive(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={multiFilePatch}
			repositoryContext={repositoryContext}
		/>
	);

	submitDraftReviewComment(
		firstRender.container,
		"Restore this submitted comment."
	);
	expect(firstRender.container.textContent).toContain(
		"Restore this submitted comment."
	);

	act(() => {
		firstRender.root.unmount();
	});

	const secondRender = renderInCurrentInteractiveWindow(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={multiFilePatch}
			repositoryContext={repositoryContext}
		/>
	);

	expect(secondRender.container.textContent).toContain(
		"Restore this submitted comment."
	);
	expect(secondRender.container.textContent).toContain("1 draft comment");
	expect(
		fileDraftReviewCommentCountTextFor(secondRender.container, "a.txt")
	).toBe("1 comment");

	act(() => {
		secondRender.root.unmount();
	});
});

test("removes persisted Draft Review Comments after successful Review Summary copy", async () => {
	const repositoryContext = reviewSession().context.repository;
	const firstRender = renderInteractive(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={multiFilePatch}
			repositoryContext={repositoryContext}
		/>
	);
	stubClipboard({
		writeText: () => Promise.resolve(),
	});

	submitDraftReviewComment(firstRender.container, "Copy clears persistence.");

	await clickCopyReview(firstRender.container);
	expect(firstRender.container.textContent).not.toContain(
		"Copy clears persistence."
	);

	act(() => {
		firstRender.root.unmount();
	});

	const secondRender = renderInCurrentInteractiveWindow(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={multiFilePatch}
			repositoryContext={repositoryContext}
		/>
	);

	expect(secondRender.container.textContent).not.toContain(
		"Copy clears persistence."
	);
	expect(secondRender.container.textContent).not.toContain("Copy review");

	act(() => {
		secondRender.root.unmount();
	});
});

test("keeps persisted Draft Review Comments after failed Review Summary copy", async () => {
	const repositoryContext = reviewSession().context.repository;
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={multiFilePatch}
			repositoryContext={repositoryContext}
		/>
	);
	stubClipboard({
		writeText: () => Promise.reject(new Error("Clipboard blocked.")),
	});

	submitDraftReviewComment(
		container,
		"Failed copy preserves persistence mirror."
	);

	await clickCopyReview(container);
	expect(container.textContent).toContain(
		"Failed copy preserves persistence mirror."
	);
	expect(container.textContent).toContain(copyReviewErrorMessage);

	act(() => {
		root.unmount();
	});

	const secondRender = renderInCurrentInteractiveWindow(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={multiFilePatch}
			repositoryContext={repositoryContext}
		/>
	);

	expect(secondRender.container.textContent).toContain(
		"Failed copy preserves persistence mirror."
	);
	expect(secondRender.container.textContent).toContain("1 draft comment");

	act(() => {
		secondRender.root.unmount();
	});
});

test("removes one persisted Draft Review Comment when discarding that comment", () => {
	const repositoryContext = reviewSession().context.repository;
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={multiFilePatch}
			repositoryContext={repositoryContext}
		/>
	);

	submitDraftReviewComment(container, "Keep after reload.", {
		fileName: "a.txt",
	});
	submitDraftReviewComment(container, "Discard before reload.", {
		fileName: "b.txt",
	});

	expect(container.textContent).toContain("2 draft comments");

	discardDraftReviewCommentContaining(container, "Discard before reload.");

	expect(container.textContent).toContain("Keep after reload.");
	expect(container.textContent).not.toContain("Discard before reload.");

	act(() => {
		root.unmount();
	});

	const secondRender = renderInCurrentInteractiveWindow(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={multiFilePatch}
			repositoryContext={repositoryContext}
		/>
	);

	expect(secondRender.container.textContent).toContain("Keep after reload.");
	expect(secondRender.container.textContent).not.toContain(
		"Discard before reload."
	);
	expect(secondRender.container.textContent).toContain("1 draft comment");

	act(() => {
		secondRender.root.unmount();
	});
});

test("removes persisted Draft Review Comments after clear-all confirms", () => {
	const confirmationMessages: string[] = [];
	let shouldConfirm = false;
	const repositoryContext = reviewSession().context.repository;

	const { container, root } = renderInteractive(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={multiFilePatch}
			repositoryContext={repositoryContext}
		/>
	);

	Object.defineProperty(window, "confirm", {
		configurable: true,
		value: (message: string) => {
			confirmationMessages.push(message);

			return shouldConfirm;
		},
	});

	const clearDraftReviewCommentsButton = () =>
		clearDraftReviewCommentsButtonFor(container);

	submitDraftReviewComment(container, "Clear resets persistence.");

	act(() => {
		clearDraftReviewCommentsButton()?.click();
	});

	expect(container.textContent).toContain("Clear resets persistence.");
	expect(confirmationMessages).toEqual([
		clearDraftReviewCommentsConfirmationMessage,
	]);

	shouldConfirm = true;
	act(() => {
		clearDraftReviewCommentsButton()?.click();
	});

	expect(confirmationMessages).toEqual([
		clearDraftReviewCommentsConfirmationMessage,
		clearDraftReviewCommentsConfirmationMessage,
	]);
	expect(container.textContent).not.toContain("Clear resets persistence.");
	expect(container.textContent).not.toContain("Copy review");

	act(() => {
		root.unmount();
	});

	const secondRender = renderInCurrentInteractiveWindow(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={multiFilePatch}
			repositoryContext={repositoryContext}
		/>
	);

	expect(secondRender.container.textContent).not.toContain(
		"Clear resets persistence."
	);
	expect(secondRender.container.textContent).not.toContain("Copy review");

	act(() => {
		secondRender.root.unmount();
	});
});

test("does not persist in-progress inline Draft Review Comment form text", () => {
	const repositoryContext = reviewSession().context.repository;
	const firstRender = renderInteractive(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={multiFilePatch}
			repositoryContext={repositoryContext}
		/>
	);

	act(() => {
		firstRender.container
			.querySelector<HTMLButtonElement>(
				'button[aria-label="Select added line"]'
			)
			?.click();
	});
	const textarea = firstRender.container.querySelector<HTMLTextAreaElement>(
		'textarea[aria-label="Draft review comment"]'
	);
	if (textarea === null) {
		throw new Error("Expected a Draft Review Comment form.");
	}
	act(() => {
		textarea.value = "Do not persist this half-written text.";
		textarea.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
	});

	act(() => {
		firstRender.root.unmount();
	});

	const secondRender = renderInCurrentInteractiveWindow(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={multiFilePatch}
			repositoryContext={repositoryContext}
		/>
	);

	expect(secondRender.container.textContent).not.toContain(
		"Do not persist this half-written text."
	);
	expect(
		secondRender.container.querySelector(
			'textarea[aria-label="Draft review comment"]'
		)
	).toBeNull();

	act(() => {
		secondRender.root.unmount();
	});
});

test("clears all Draft Review Comments only after browser confirmation", () => {
	const confirmationMessages: string[] = [];
	const clipboardWrites: string[] = [];
	let shouldConfirm = false;
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff DiffRenderer={FileDiffProbe} patch={multiFilePatch} />
	);
	stubClipboard({
		writeText: (text) => {
			clipboardWrites.push(text);

			return Promise.resolve();
		},
	});
	Object.defineProperty(window, "confirm", {
		configurable: true,
		value: (message: string) => {
			confirmationMessages.push(message);

			return shouldConfirm;
		},
	});
	const clearDraftReviewCommentsButton = () =>
		clearDraftReviewCommentsButtonFor(container);

	submitDraftReviewComment(container, "Clear this only after confirmation.");

	expect(clearDraftReviewCommentsButton()).not.toBeNull();

	act(() => {
		clearDraftReviewCommentsButton()?.click();
	});

	expect(confirmationMessages).toEqual([
		clearDraftReviewCommentsConfirmationMessage,
	]);
	expect(container.textContent).toContain(
		"Clear this only after confirmation."
	);
	expect(clipboardWrites).toEqual([]);

	shouldConfirm = true;
	act(() => {
		clearDraftReviewCommentsButton()?.click();
	});

	expect(confirmationMessages).toEqual([
		clearDraftReviewCommentsConfirmationMessage,
		clearDraftReviewCommentsConfirmationMessage,
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
	const aCollapseToggle = () => fileCollapseToggleFor(container, "a.txt");
	const bCollapseToggle = () => fileCollapseToggleFor(container, "b.txt");
	const clearDraftReviewCommentsButton = () =>
		clearDraftReviewCommentsButtonFor(container);

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
		clearDraftReviewCommentsButton()?.click();
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
	stubClipboard({
		writeText: () => Promise.reject(new Error("Clipboard blocked.")),
	});

	submitDraftReviewComment(container, "Do not lose this.");

	await clickCopyReview(container);

	expect(container.textContent).toContain("Do not lose this.");
	expect(container.textContent).toContain(copyReviewErrorMessage);

	act(() => {
		root.unmount();
	});
});

test("keeps Draft Review Comments when clipboard copying is unavailable", async () => {
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff DiffRenderer={FileDiffProbe} patch={multiFilePatch} />
	);
	stubClipboard(undefined);

	submitDraftReviewComment(container, "Keep this without clipboard access.");

	await clickCopyReview(container);

	expect(container.textContent).toContain(
		"Keep this without clipboard access."
	);
	expect(container.textContent).toContain(copyReviewErrorMessage);

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
		fileCollapseToggleFor(container, "large.txt");

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

test("selects Patch File Navigator rows to expand and scroll Continuous Diff View files without marking them viewed", async () => {
	const scrolledFileLabels: string[] = [];
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff DiffRenderer={FileDiffProbe} patch={navigatorPatch} />
	);
	const scrollIntoView = function scrollIntoView(this: HTMLElement) {
		const label = this.dataset.reviewFileLabel;
		if (label !== undefined) {
			scrolledFileLabels.push(label);
		}
	};
	const restoreScrollIntoView = stubScrollIntoView(scrollIntoView);
	const largeFile = () => fileProbeFor(container, "large.txt");
	const largeViewed = () => viewedControlFor(container, "large.txt");

	await waitForPatchNavigatorRender();

	expect(patchNavigatorFileRowFor(container, "large.txt")).not.toBeNull();
	expect(patchNavigatorFileRowFor(container, "src/target.ts")).not.toBeNull();
	expect(isPatchNavigatorFileRowSelected(container, "large.txt")).toBe(false);
	expect(largeFile()?.dataset.collapsed).toBe("true");
	expect(viewedControlPressedState(largeViewed())).toBe("false");

	await clickPatchNavigatorFileRow(container, "large.txt");

	expect(largeFile()?.dataset.collapsed).toBe("false");
	expect(viewedControlPressedState(largeViewed())).toBe("false");
	expect(isPatchNavigatorFileRowSelected(container, "large.txt")).toBe(true);
	expect(scrolledFileLabels).toEqual(["large.txt"]);

	act(() => {
		root.unmount();
	});
	restoreScrollIntoView();
});

test("highlights the current Patch File Navigator row from navigation state", async () => {
	const navigatorModel = patchFileNavigatorModelFor(
		createContinuousDiffViewInteraction(multiFilePatch).files
	);
	const aFileKey = navigatorModel.fileKeyForTreePath("a.txt");
	const bFileKey = navigatorModel.fileKeyForTreePath("b.txt");
	const ignoreFileSelection = () => undefined;
	const emptyNavigatorFileMetadata = {};
	const { container, root } = renderInteractive(
		<PatchFileNavigatorSidebar
			fileMetadataByKey={emptyNavigatorFileMetadata}
			model={navigatorModel}
			onSelectFileKey={ignoreFileSelection}
			selectedFileKey={aFileKey}
		/>
	);

	await act(async () => {
		await Promise.resolve();
	});

	expect(isPatchNavigatorFileRowSelected(container, "a.txt")).toBe(true);
	expect(isPatchNavigatorFileRowSelected(container, "b.txt")).toBe(false);

	act(() => {
		root.render(
			<PatchFileNavigatorSidebar
				fileMetadataByKey={emptyNavigatorFileMetadata}
				model={navigatorModel}
				onSelectFileKey={ignoreFileSelection}
				selectedFileKey={bFileKey}
			/>
		);
	});
	await act(async () => {
		await Promise.resolve();
	});

	expect(isPatchNavigatorFileRowSelected(container, "a.txt")).toBe(false);
	expect(isPatchNavigatorFileRowSelected(container, "b.txt")).toBe(true);

	act(() => {
		root.unmount();
	});
});

test("filters Patch File Navigator paths by search query", async () => {
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff DiffRenderer={FileDiffProbe} patch={navigatorPatch} />
	);

	await waitForPatchNavigatorRender();

	const searchInput = patchNavigatorSearchInputFor(container);

	expect(searchInput).not.toBeNull();
	if (searchInput === null) {
		throw new Error("Expected Patch File Navigator search input.");
	}
	expect(patchNavigatorFileRowFor(container, "large.txt")).not.toBeNull();
	expect(patchNavigatorFileRowFor(container, "src/target.ts")).not.toBeNull();

	await enterPatchNavigatorSearchQuery(searchInput, "target");

	expect(patchNavigatorFileRowFor(container, "large.txt")).toBeNull();
	expect(patchNavigatorFileRowFor(container, "src/target.ts")).not.toBeNull();

	await enterPatchNavigatorSearchQuery(searchInput, "");

	expect(patchNavigatorFileRowFor(container, "large.txt")).not.toBeNull();
	expect(patchNavigatorFileRowFor(container, "src/target.ts")).not.toBeNull();

	act(() => {
		root.unmount();
	});
});

test("maps duplicate Patch File Navigator paths to the selected rendered file", async () => {
	const scrolledFileIndexes: number[] = [];
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={repeatedFilePatch}
		/>
	);
	const scrollIntoView = function scrollIntoView(this: HTMLElement) {
		const fileWrappers = Array.from(
			container.querySelectorAll<HTMLElement>(".continuous-diff-view-file")
		);
		const index = fileWrappers.indexOf(this);

		if (index >= 0) {
			scrolledFileIndexes.push(index);
		}
	};
	const restoreScrollIntoView = stubScrollIntoView(scrollIntoView);

	await waitForPatchNavigatorRender();

	expect(patchNavigatorFileRowFor(container, "a.txt")).not.toBeNull();
	expect(patchNavigatorFileRowFor(container, "a.txt (2)")).not.toBeNull();

	await clickPatchNavigatorFileRow(container, "a.txt (2)");

	expect(scrolledFileIndexes).toEqual([1]);
	expect(
		Array.from(
			container.querySelectorAll<HTMLElement>(".continuous-diff-view-file")
		).map((file) =>
			file.classList.contains("is-navigation-selected")
				? "selected"
				: "unselected"
		)
	).toEqual(["unselected", "selected"]);

	act(() => {
		root.unmount();
	});
	restoreScrollIntoView();
});

test("shows renamed files in the Patch File Navigator with previous-path context", async () => {
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={draftCommentPatch}
		/>
	);

	await waitForPatchNavigatorRender();

	const renamedRow = patchNavigatorFileRowFor(container, "new-name.txt");

	expect(renamedRow).not.toBeNull();
	expect(patchNavigatorFileRowFor(container, "old-name.txt")).toBeNull();
	expect(renamedRow?.textContent).toContain("renamed");
	expect(
		renamedRow?.querySelector('[title="Renamed from old-name.txt"]')
	).not.toBeNull();

	act(() => {
		root.unmount();
	});
});

test("shows Patch File Navigator review badges only on file rows", async () => {
	const { container, root } = renderInteractive(
		<ContinuousPatchDiff
			DiffRenderer={FileDiffProbe}
			patch={navigatorMetadataPatch}
		/>
	);

	await act(async () => {
		await Promise.resolve();
	});

	const modifiedRow = () => patchNavigatorFileRowFor(container, "src/alpha.ts");
	const createdRow = () => patchNavigatorFileRowFor(container, "src/beta.ts");
	const removedRow = () => patchNavigatorFileRowFor(container, "src/gamma.ts");
	const renamedRow = () => patchNavigatorFileRowFor(container, "src/delta.ts");
	const folderRow = () => patchNavigatorRowFor(container, "src/");
	const modifiedViewed = () => viewedControlFor(container, "src/alpha.ts");
	const createdCollapseToggle = () =>
		fileCollapseToggleFor(container, "src/beta.ts");

	expect(modifiedRow()?.textContent).toContain("modified");
	expect(createdRow()?.textContent).toContain("added");
	expect(removedRow()?.textContent).toContain("deleted");
	expect(renamedRow()?.textContent).toContain("renamed");
	expect(
		renamedRow()?.querySelector('[title="Renamed from old-name.ts"]')
	).not.toBeNull();
	expect(folderRow()).not.toBeNull();
	expect(folderRow()?.textContent).not.toContain("modified");
	expect(folderRow()?.textContent).not.toContain("added");
	expect(folderRow()?.textContent).not.toContain("deleted");
	expect(folderRow()?.textContent).not.toContain("renamed");

	submitDraftReviewComment(
		container,
		"Navigator should count submitted comments.",
		{
			fileName: "src/alpha.ts",
		}
	);

	expect(modifiedRow()?.textContent).toContain("1 comment");
	expect(folderRow()?.textContent).not.toContain("1 comment");

	act(() => {
		modifiedViewed()?.click();
		createdCollapseToggle()?.click();
	});

	expect(modifiedRow()?.textContent).toContain("Viewed");
	expect(createdRow()?.textContent).not.toContain("collapsed");
	expect(folderRow()?.textContent).not.toContain("Viewed");
	expect(folderRow()?.textContent).not.toContain("collapsed");

	act(() => {
		root.unmount();
	});
});

test("renders Commit Review command without extra header metadata", () => {
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
	expect(html).not.toContain("abc123d");
	expect(html).not.toContain("Ada Lovelace");
	expect(html).not.toContain("Teach diffuser to show commits");
});
