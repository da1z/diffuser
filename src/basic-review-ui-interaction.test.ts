import { expect, test } from "bun:test";

import {
	type BasicReviewUiInteraction,
	basicReviewUiAfterDeleteSubmittedDraftReviewComment,
	copyReviewSummaryThroughBasicReviewUi,
	createBasicReviewUiInteractionFromPatch,
	type DraftReviewCommentPersistenceMode,
	draftReviewCommentPersistenceFailureMessage,
	type LocalCommentPersistenceLoadAdapter,
	type LocalCommentPersistenceSubmitMirrorAdapter,
	mirrorSubmittedDraftReviewCommentsSync,
	requestClearSubmittedDraftReviewComments,
	submitDraftReviewCommentThroughBasicReviewUi,
} from "./basic-review-ui-interaction";
import {
	continuousDiffViewDraftReviewCommentCountForFile,
	selectContinuousDiffViewLines,
	submitContinuousDiffViewDraftReviewComment,
} from "./continuous-diff-view-interaction";
import { copyReviewErrorMessage } from "./draft-review-comment-copy-clear-policy";
import {
	type LocalCommentStorage,
	loadPersistedDraftReviewComments,
	savePersistedDraftReviewComments,
} from "./local-comment-persistence";
import type { SubmittedDraftReviewComment } from "./review-comments";

const noRestoredCommentsAdapter: LocalCommentPersistenceLoadAdapter = {
	loadRestoredSubmittedDraftReviewComments: () => [],
};

const additionsSideCommentAnchorForSubmitTests = {
	end: 2,
	side: "additions",
	start: 4,
} as const;

const requireSolePatchFile = (interaction: BasicReviewUiInteraction) => {
	const [file] = interaction.continuousDiffView.files;

	if (file === undefined) {
		throw new Error("Expected one parsed Patch file.");
	}

	return file;
};

const withSelectedAdditionsLinesForSubmitTests = (
	interaction: BasicReviewUiInteraction,
	fileKey: string
): BasicReviewUiInteraction => ({
	...interaction,
	continuousDiffView: selectContinuousDiffViewLines(
		interaction.continuousDiffView,
		fileKey,
		additionsSideCommentAnchorForSubmitTests
	),
});

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

const fileKeyForDraftCommentPatch = (): string => {
	const [file] = createBasicReviewUiInteractionFromPatch(
		draftCommentPatch,
		noRestoredCommentsAdapter
	).continuousDiffView.files;

	if (file === undefined) {
		throw new Error("Expected one parsed Patch file.");
	}

	return file.key;
};

test("loads restored Draft Review Comments from a fake persistence Adapter into Continuous Diff View state", () => {
	const [file] = createBasicReviewUiInteractionFromPatch(
		draftCommentPatch,
		noRestoredCommentsAdapter
	).continuousDiffView.files;

	if (file === undefined) {
		throw new Error("Expected one parsed Patch file.");
	}

	const restoredBody = "Restored via Basic Review UI Adapter.";
	const interaction = createBasicReviewUiInteractionFromPatch(
		draftCommentPatch,
		{
			loadRestoredSubmittedDraftReviewComments: () => [
				{
					anchor: {
						endLine: 4,
						fileKey: file.key,
						fileOrder: 0,
						path: "new-name.txt",
						position: 1,
						side: "new",
						startLine: 2,
					},
					body: restoredBody,
					id: "draft-review-comment-1",
					order: 1,
				},
			],
		}
	);

	expect(interaction.persistenceWarning).toBeUndefined();
	expect(
		interaction.continuousDiffView.draftReviewCommentState.submittedComments
	).toEqual([
		{
			anchor: {
				endLine: 4,
				fileKey: file.key,
				fileOrder: 0,
				path: "new-name.txt",
				position: 1,
				side: "new",
				startLine: 2,
			},
			body: restoredBody,
			id: "draft-review-comment-1",
			order: 1,
		},
	]);
	expect(
		continuousDiffViewDraftReviewCommentCountForFile(
			interaction.continuousDiffView,
			file.key
		)
	).toBe(1);
});

test("initial Basic Review UI state has no persistence warning when the Adapter yields no comments", () => {
	const interaction = createBasicReviewUiInteractionFromPatch(
		draftCommentPatch,
		noRestoredCommentsAdapter
	);

	expect(interaction.persistenceWarning).toBeUndefined();
	expect(
		interaction.continuousDiffView.draftReviewCommentState.submittedComments
	).toEqual([]);
});

test("submit Draft Review Comment surfaces persistence warning when mirror adapter reports failure", () => {
	let interaction = createBasicReviewUiInteractionFromPatch(
		draftCommentPatch,
		noRestoredCommentsAdapter
	);
	const file = requireSolePatchFile(interaction);

	interaction = withSelectedAdditionsLinesForSubmitTests(interaction, file.key);

	const failingMirror: LocalCommentPersistenceSubmitMirrorAdapter = {
		mirrorSubmittedDraftReviewCommentsAfterSubmit: () => "fail",
	};

	const submittedBody = "Visible despite persistence mirror failure.";
	interaction = submitDraftReviewCommentThroughBasicReviewUi(
		interaction,
		submittedBody,
		failingMirror
	);

	expect(interaction.persistenceWarning).toBe(
		draftReviewCommentPersistenceFailureMessage
	);
	expect(
		interaction.continuousDiffView.draftReviewCommentState.submittedComments
	).toMatchObject([{ body: submittedBody }]);
});

test("submit Draft Review Comment clears persistence warning when mirror adapter reports ok after failure", () => {
	let interaction = createBasicReviewUiInteractionFromPatch(
		draftCommentPatch,
		noRestoredCommentsAdapter
	);
	const file = requireSolePatchFile(interaction);

	interaction = withSelectedAdditionsLinesForSubmitTests(interaction, file.key);

	const failingMirror: LocalCommentPersistenceSubmitMirrorAdapter = {
		mirrorSubmittedDraftReviewCommentsAfterSubmit: () => "fail",
	};

	interaction = submitDraftReviewCommentThroughBasicReviewUi(
		interaction,
		"First submission.",
		failingMirror
	);

	expect(interaction.persistenceWarning).toBe(
		draftReviewCommentPersistenceFailureMessage
	);

	interaction = withSelectedAdditionsLinesForSubmitTests(interaction, file.key);

	const okMirror: LocalCommentPersistenceSubmitMirrorAdapter = {
		mirrorSubmittedDraftReviewCommentsAfterSubmit: () => "ok",
	};

	interaction = submitDraftReviewCommentThroughBasicReviewUi(
		interaction,
		"Second submission.",
		okMirror
	);

	expect(interaction.persistenceWarning).toBeUndefined();
	expect(
		interaction.continuousDiffView.draftReviewCommentState.submittedComments
	).toHaveLength(2);
});

test("submit Draft Review Comment does not add persistence warning when mirror adapter skips persistence", () => {
	let interaction = createBasicReviewUiInteractionFromPatch(
		draftCommentPatch,
		noRestoredCommentsAdapter
	);
	const file = requireSolePatchFile(interaction);

	interaction = withSelectedAdditionsLinesForSubmitTests(interaction, file.key);

	let mirroredLength = -1;
	const skippedMirror: LocalCommentPersistenceSubmitMirrorAdapter = {
		mirrorSubmittedDraftReviewCommentsAfterSubmit: (submittedComments) => {
			mirroredLength = submittedComments.length;

			return "skipped";
		},
	};

	const submittedBody = "Session-only submission.";
	interaction = submitDraftReviewCommentThroughBasicReviewUi(
		interaction,
		submittedBody,
		skippedMirror
	);

	expect(interaction.persistenceWarning).toBeUndefined();
	expect(mirroredLength).toBe(1);
	expect(
		interaction.continuousDiffView.draftReviewCommentState.submittedComments
	).toMatchObject([{ body: submittedBody }]);
});

const repositoryContext = {
	root: "/workspace/project",
	workingDirectory: "/workspace/project/packages/app",
} as const;

const memoryStorageForPersistence = (): LocalCommentStorage => {
	const items = new Map<string, string>();

	return {
		getItem: (key: string) => items.get(key) ?? null,
		removeItem: (key: string) => {
			items.delete(key);
		},
		setItem: (key: string, value: string) => {
			items.set(key, value);
		},
	};
};

const persistenceScopeUsing = ({
	patchText,
	storage,
}: {
	readonly patchText: string;
	readonly storage: LocalCommentStorage;
}) =>
	({
		patch: patchText,
		repositoryContext,
		storage,
	}) as const;

const sampleCommentsForRenamePatch = (
	firstFileKey: string
): [
	SubmittedDraftReviewComment & { readonly id: "draft-review-comment-1" },
	SubmittedDraftReviewComment & { readonly id: "draft-review-comment-2" },
] => [
	{
		anchor: {
			endLine: 4,
			fileKey: firstFileKey,
			fileOrder: 0,
			path: "new-name.txt",
			position: 1,
			side: "new",
			startLine: 2,
		},
		body: "first",
		id: "draft-review-comment-1",
		order: 1,
	},
	{
		anchor: {
			endLine: 4,
			fileKey: firstFileKey,
			fileOrder: 0,
			path: "new-name.txt",
			position: 1,
			side: "new",
			startLine: 2,
		},
		body: "second",
		id: "draft-review-comment-2",
		order: 2,
	},
];

test("deleting one submitted Draft Review Comment mirrors the remaining comments to persistence when persistence is ready", () => {
	const storage = memoryStorageForPersistence();
	const scope = persistenceScopeUsing({
		patchText: draftCommentPatch,
		storage,
	});
	const fileKey = fileKeyForDraftCommentPatch();
	const [comment1, comment2] = sampleCommentsForRenamePatch(fileKey);

	expect(savePersistedDraftReviewComments(scope, [comment1, comment2]).ok).toBe(
		true
	);

	const interaction = createBasicReviewUiInteractionFromPatch(
		draftCommentPatch,
		{
			loadRestoredSubmittedDraftReviewComments: () =>
				loadPersistedDraftReviewComments(scope),
		}
	);

	const persistence: DraftReviewCommentPersistenceMode = {
		kind: "ready",
		scope,
	};
	const next = basicReviewUiAfterDeleteSubmittedDraftReviewComment(
		interaction,
		comment2.id,
		persistence
	);

	expect(next.persistenceWarning).toBeUndefined();
	expect(
		next.continuousDiffView.draftReviewCommentState.submittedComments
	).toEqual([comment1]);
	expect(loadPersistedDraftReviewComments(scope)).toEqual([comment1]);
});

test("deleting the last submitted Draft Review Comment clears persistence when persistence is ready", () => {
	const storage = memoryStorageForPersistence();
	const scope = persistenceScopeUsing({
		patchText: draftCommentPatch,
		storage,
	});
	const [, comment2] = sampleCommentsForRenamePatch(
		fileKeyForDraftCommentPatch()
	);

	expect(savePersistedDraftReviewComments(scope, [comment2]).ok).toBe(true);

	const interaction = createBasicReviewUiInteractionFromPatch(
		draftCommentPatch,
		{
			loadRestoredSubmittedDraftReviewComments: () =>
				loadPersistedDraftReviewComments(scope),
		}
	);

	const persistence: DraftReviewCommentPersistenceMode = {
		kind: "ready",
		scope,
	};
	const next = basicReviewUiAfterDeleteSubmittedDraftReviewComment(
		interaction,
		comment2.id,
		persistence
	);

	expect(next.persistenceWarning).toBeUndefined();
	expect(
		next.continuousDiffView.draftReviewCommentState.submittedComments
	).toEqual([]);
	expect(loadPersistedDraftReviewComments(scope)).toEqual([]);
});

test("deleting preserves Local Review UI state when persistence save fails while surfacing persistence warning when comments remain mirrored", () => {
	const flakyUnderlying = memoryStorageForPersistence();
	const flaky: LocalCommentStorage = {
		getItem: (key) => flakyUnderlying.getItem(key),
		removeItem: (_key) => {
			throw new Error("Storage remove blocked.");
		},
		setItem: (_key, _value) => {
			throw new Error("Storage write blocked.");
		},
	};

	const scope = persistenceScopeUsing({
		patchText: draftCommentPatch,
		storage: flaky,
	});
	const fileKey = fileKeyForDraftCommentPatch();
	const [comment1, comment2] = sampleCommentsForRenamePatch(fileKey);

	const interactionWithTwo = createBasicReviewUiInteractionFromPatch(
		draftCommentPatch,
		{
			loadRestoredSubmittedDraftReviewComments: () => [comment1, comment2],
		}
	);

	const persistence: DraftReviewCommentPersistenceMode = {
		kind: "ready",
		scope,
	};
	const next = basicReviewUiAfterDeleteSubmittedDraftReviewComment(
		interactionWithTwo,
		comment1.id,
		persistence
	);

	expect(
		next.continuousDiffView.draftReviewCommentState.submittedComments
	).toEqual([comment2]);
	expect(next.persistenceWarning).toEqual(
		draftReviewCommentPersistenceFailureMessage
	);
});

test("mirror after delete skips persistence warnings when persistence mode is none", () => {
	const sync = mirrorSubmittedDraftReviewCommentsSync({ kind: "none" }, [
		{
			anchor: {
				endLine: 1,
				fileKey: "k",
				fileOrder: 0,
				path: "p",
				position: 1,
				side: "new",
				startLine: 1,
			},
			body: "still here",
			id: "draft-review-comment-9",
			order: 9,
		},
	]);

	expect(sync).toEqual({ kind: "unchanged" });
});

test("mirror after delete warns for storage unavailable only while submitted Draft Review Comments remain", () => {
	expect(
		mirrorSubmittedDraftReviewCommentsSync({ kind: "storage-unavailable" }, [
			{
				anchor: {
					endLine: 1,
					fileKey: "k",
					fileOrder: 0,
					path: "p",
					position: 1,
					side: "new",
					startLine: 1,
				},
				body: "at risk",
				id: "draft-review-comment-1",
				order: 1,
			},
		])
	).toEqual({
		kind: "set",
		message: draftReviewCommentPersistenceFailureMessage,
	});

	expect(
		mirrorSubmittedDraftReviewCommentsSync({ kind: "storage-unavailable" }, [])
	).toEqual({ kind: "set", message: undefined });
});

test("deleting clears persistence warning left from storage unavailable after the final comment is discarded", () => {
	const interaction = createBasicReviewUiInteractionFromPatch(
		draftCommentPatch,
		{
			loadRestoredSubmittedDraftReviewComments: () => [
				{
					anchor: {
						endLine: 4,
						fileKey: fileKeyForDraftCommentPatch(),
						fileOrder: 0,
						path: "new-name.txt",
						position: 1,
						side: "new",
						startLine: 2,
					},
					body: "only",
					id: "draft-review-comment-77",
					order: 77,
				},
			],
		}
	);

	const loneComment =
		interaction.continuousDiffView.draftReviewCommentState.submittedComments[0];

	if (loneComment === undefined) {
		throw new Error("Expected one submitted Draft Review Comment.");
	}

	const loneId = loneComment.id;

	const worried: typeof interaction = {
		...interaction,
		persistenceWarning: draftReviewCommentPersistenceFailureMessage,
	};

	const next = basicReviewUiAfterDeleteSubmittedDraftReviewComment(
		worried,
		loneId,
		{ kind: "storage-unavailable" }
	);

	expect(
		next.continuousDiffView.draftReviewCommentState.submittedComments
	).toEqual([]);
	expect(next.persistenceWarning).toBeUndefined();
});

const basicReviewUiWithSubmittedComment = (): {
	readonly basic: BasicReviewUiInteraction;
	readonly clipboardSummaryLine: string;
} => {
	const initial = createBasicReviewUiInteractionFromPatch(
		draftCommentPatch,
		noRestoredCommentsAdapter
	);
	const [file] = initial.continuousDiffView.files;

	if (file === undefined) {
		throw new Error("Expected one parsed Patch file.");
	}

	const selected = selectContinuousDiffViewLines(
		initial.continuousDiffView,
		file.key,
		{ end: 2, side: "additions", start: 2 }
	);
	const body = "Clipboard summary line.";
	const withComment = submitContinuousDiffViewDraftReviewComment(
		selected,
		body
	);

	return {
		basic: {
			continuousDiffView: withComment,
			persistenceWarning: undefined,
		},
		clipboardSummaryLine: `new-name.txt:2 [new]\n${body}`,
	};
};

const basicReviewUiWithOneSubmittedComment = () => {
	const base = createBasicReviewUiInteractionFromPatch(
		draftCommentPatch,
		noRestoredCommentsAdapter
	);
	const [file] = base.continuousDiffView.files;

	if (file === undefined) {
		throw new Error("Expected one parsed Patch file.");
	}

	const selected = selectContinuousDiffViewLines(
		base.continuousDiffView,
		file.key,
		{
			end: 4,
			side: "additions",
			start: 2,
		}
	);

	return {
		...base,
		continuousDiffView: submitContinuousDiffViewDraftReviewComment(
			selected,
			"Submitted for clear-all policy."
		),
	};
};

test("Review Summary copy success clears submitted Draft Review Comments and mirrors persistence", async () => {
	const { basic, clipboardSummaryLine } = basicReviewUiWithSubmittedComment();
	const clipboardWrites: string[] = [];
	const mirrorSnapshots: string[][] = [];

	const next = await copyReviewSummaryThroughBasicReviewUi(
		basic,
		{
			writeText: (text) => {
				clipboardWrites.push(text);

				return Promise.resolve();
			},
		},
		{
			mirrorSubmittedComments: (comments) => {
				mirrorSnapshots.push(comments.map((c) => c.body));

				return { kind: "set", message: undefined };
			},
		}
	);

	expect(clipboardWrites).toEqual([clipboardSummaryLine]);
	expect(
		next.continuousDiffView.draftReviewCommentState.submittedComments
	).toEqual([]);
	expect(next.continuousDiffView.copyError).toBeUndefined();
	expect(mirrorSnapshots).toEqual([[]]);
	expect(next.persistenceWarning).toBeUndefined();
});

test("Review Summary copy failure preserves submitted Draft Review Comments and skips persistence mirror", async () => {
	const { basic } = basicReviewUiWithSubmittedComment();
	let mirrorCalled = false;

	const next = await copyReviewSummaryThroughBasicReviewUi(
		basic,
		{
			writeText: () => Promise.reject(new Error("Clipboard blocked.")),
		},
		{
			mirrorSubmittedComments: () => {
				mirrorCalled = true;

				return { kind: "unchanged" };
			},
		}
	);

	expect(mirrorCalled).toBe(false);
	expect(
		next.continuousDiffView.draftReviewCommentState.submittedComments
	).toHaveLength(1);
	expect(next.continuousDiffView.copyError).toBe(copyReviewErrorMessage);
	expect(next.persistenceWarning).toBeUndefined();
});

test("Review Summary copy success keeps comments cleared when persistence mirror fails", async () => {
	const { basic } = basicReviewUiWithSubmittedComment();
	const persistenceMsg =
		"Draft comments could not be saved in this browser. They will be lost if you reload the page.";

	const next = await copyReviewSummaryThroughBasicReviewUi(
		basic,
		{
			writeText: () => Promise.resolve(),
		},
		{
			mirrorSubmittedComments: () => ({
				kind: "set",
				message: persistenceMsg,
			}),
		}
	);

	expect(
		next.continuousDiffView.draftReviewCommentState.submittedComments
	).toEqual([]);
	expect(next.persistenceWarning).toBe(persistenceMsg);
});

test("Basic Review UI clear-all skips persistence mirror when confirmation is cancelled", () => {
	const review = basicReviewUiWithOneSubmittedComment();
	let mirrorCalls = 0;

	const next = requestClearSubmittedDraftReviewComments(
		review,
		() => false,
		() => {
			mirrorCalls++;

			return { kind: "unchanged" };
		}
	);

	expect(mirrorCalls).toBe(0);
	expect(next).toBe(review);
	expect(
		next.continuousDiffView.draftReviewCommentState.submittedComments
	).toHaveLength(1);
});

test("Basic Review UI clear-all clears submitted comments when confirmed and invokes persistence mirror", () => {
	const review = basicReviewUiWithOneSubmittedComment();
	let mirrored: typeof review.continuousDiffView | undefined;

	const next = requestClearSubmittedDraftReviewComments(
		review,
		() => true,
		(clearedView) => {
			mirrored = clearedView;
			expect(clearedView.draftReviewCommentState.submittedComments).toEqual([]);

			return { kind: "set", message: undefined };
		}
	);

	expect(mirrored).toBe(next.continuousDiffView);
	expect(
		next.continuousDiffView.draftReviewCommentState.submittedComments
	).toEqual([]);
});

test("Basic Review UI clear-all keeps comments cleared in the Local Review UI when persistence mirror reports failure", () => {
	const review = basicReviewUiWithOneSubmittedComment();

	const next = requestClearSubmittedDraftReviewComments(
		review,
		() => true,
		() => ({
			kind: "set",
			message: draftReviewCommentPersistenceFailureMessage,
		})
	);

	expect(
		next.continuousDiffView.draftReviewCommentState.submittedComments
	).toEqual([]);
	expect(next.persistenceWarning).toBe(
		draftReviewCommentPersistenceFailureMessage
	);
});

test("Basic Review UI clear-all preserves prior persistence warning when mirror returns unchanged", () => {
	const priorWarning = "Prior persistence signal.";
	const review = {
		...basicReviewUiWithOneSubmittedComment(),
		persistenceWarning: priorWarning,
	};

	const next = requestClearSubmittedDraftReviewComments(
		review,
		() => true,
		() => ({ kind: "unchanged" })
	);

	expect(
		next.continuousDiffView.draftReviewCommentState.submittedComments
	).toEqual([]);
	expect(next.persistenceWarning).toBe(priorWarning);
});
