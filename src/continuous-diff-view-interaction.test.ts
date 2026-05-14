import { expect, test } from "bun:test";

import {
	confirmClearContinuousDiffViewDraftReviewComments,
	continuousDiffViewDraftReviewCommentCountForFile,
	continuousDiffViewFileState,
	continuousDiffViewSelectedLinesForFile,
	copyContinuousDiffViewReview,
	createContinuousDiffViewInteraction,
	markContinuousDiffViewFileViewed,
	selectContinuousDiffViewLines,
	submitContinuousDiffViewDraftReviewComment,
	toggleContinuousDiffViewFileCollapsed,
} from "./continuous-diff-view-interaction";
import { copyReviewErrorMessage } from "./draft-review-comment-copy-clear-policy";
import { draftReviewCommentStateWithSubmittedComments } from "./review-comments";

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

test("owns Viewed File and collapsed state for Continuous Diff View files", () => {
	const initial = createContinuousDiffViewInteraction(multiFilePatch);
	const [firstFile, secondFile] = initial.files;

	if (firstFile === undefined || secondFile === undefined) {
		throw new Error("Expected two parsed Patch files.");
	}

	expect(firstFile.label).toBe("a.txt");
	expect(secondFile.label).toBe("b.txt");
	expect(continuousDiffViewFileState(initial, firstFile.key)).toEqual({
		collapsed: false,
		viewed: false,
	});

	const viewed = markContinuousDiffViewFileViewed(initial, firstFile.key, true);

	expect(continuousDiffViewFileState(viewed, firstFile.key)).toEqual({
		collapsed: true,
		viewed: true,
	});
	expect(continuousDiffViewFileState(viewed, secondFile.key)).toEqual({
		collapsed: false,
		viewed: false,
	});

	const expanded = toggleContinuousDiffViewFileCollapsed(viewed, firstFile.key);

	expect(continuousDiffViewFileState(expanded, firstFile.key)).toEqual({
		collapsed: false,
		viewed: true,
	});
});

test("owns Draft Review Comment anchors, selected lines, and per-file counts", () => {
	const initial = createContinuousDiffViewInteraction(draftCommentPatch);
	const [file] = initial.files;

	if (file === undefined) {
		throw new Error("Expected one parsed Patch file.");
	}

	const selected = selectContinuousDiffViewLines(initial, file.key, {
		end: 2,
		side: "additions",
		start: 4,
	});

	expect(selected.activeDraftReviewCommentAnchor).toEqual({
		endLine: 4,
		fileKey: file.key,
		fileOrder: 0,
		path: "new-name.txt",
		position: 1,
		side: "new",
		startLine: 2,
	});
	expect(continuousDiffViewSelectedLinesForFile(selected, file.key)).toEqual({
		end: 2,
		side: "additions",
		start: 4,
	});

	const submitted = submitContinuousDiffViewDraftReviewComment(
		selected,
		"  Please check the new flow.  "
	);

	expect(submitted.activeDraftReviewCommentAnchor).toBeUndefined();
	expect(
		continuousDiffViewSelectedLinesForFile(submitted, file.key)
	).toBeNull();
	expect(submitted.draftReviewCommentState.submittedComments).toEqual([
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
			body: "Please check the new flow.",
			id: "draft-review-comment-1",
			order: 1,
		},
	]);
	expect(
		continuousDiffViewDraftReviewCommentCountForFile(submitted, file.key)
	).toBe(1);
});

test("initializes restored Draft Review Comments without reusing comment identifiers", () => {
	const initial = createContinuousDiffViewInteraction(
		draftCommentPatch,
		draftReviewCommentStateWithSubmittedComments([
			{
				anchor: {
					endLine: 4,
					fileKey: "0\0new-name.txt",
					fileOrder: 0,
					path: "new-name.txt",
					position: 1,
					side: "new",
					startLine: 2,
				},
				body: "Restored comment.",
				id: "draft-review-comment-4",
				order: 4,
			},
		])
	);
	const [file] = initial.files;

	if (file === undefined) {
		throw new Error("Expected one parsed Patch file.");
	}

	const selected = selectContinuousDiffViewLines(initial, file.key, {
		end: 2,
		side: "additions",
		start: 2,
	});
	const submitted = submitContinuousDiffViewDraftReviewComment(
		selected,
		"New comment."
	);

	expect(
		submitted.draftReviewCommentState.submittedComments.map((comment) => [
			comment.id,
			comment.order,
			comment.body,
		])
	).toEqual([
		["draft-review-comment-4", 4, "Restored comment."],
		["draft-review-comment-5", 5, "New comment."],
	]);
});

test("normalizes persisted comment array order and avoids identifier collisions after restore", () => {
	const [file] = createContinuousDiffViewInteraction(draftCommentPatch).files;

	if (file === undefined) {
		throw new Error("Expected one parsed Patch file.");
	}

	const sharedAnchor = {
		endLine: 4,
		fileKey: file.key,
		fileOrder: 0,
		path: "new-name.txt",
		position: 1,
		side: "new" as const,
		startLine: 2,
	};

	const initial = createContinuousDiffViewInteraction(
		draftCommentPatch,
		draftReviewCommentStateWithSubmittedComments([
			{
				anchor: sharedAnchor,
				body: "Later in storage array.",
				id: "draft-review-comment-2",
				order: 2,
			},
			{
				anchor: sharedAnchor,
				body: "Earlier in storage array.",
				id: "draft-review-comment-1",
				order: 1,
			},
		])
	);

	expect(
		initial.draftReviewCommentState.submittedComments.map(
			(comment) => comment.body
		)
	).toEqual(["Earlier in storage array.", "Later in storage array."]);

	const selected = selectContinuousDiffViewLines(initial, file.key, {
		end: 3,
		side: "additions",
		start: 3,
	});
	const submitted = submitContinuousDiffViewDraftReviewComment(
		selected,
		"New comment after restore."
	);

	expect(
		submitted.draftReviewCommentState.submittedComments.map((comment) => [
			comment.id,
			comment.order,
			comment.body,
		])
	).toEqual([
		["draft-review-comment-1", 1, "Earlier in storage array."],
		["draft-review-comment-2", 2, "Later in storage array."],
		["draft-review-comment-3", 3, "New comment after restore."],
	]);
});

test("owns Review Summary copy and clear confirmation policy", async () => {
	const initial = createContinuousDiffViewInteraction(multiFilePatch);
	const [file] = initial.files;
	const clipboardWrites: string[] = [];

	if (file === undefined) {
		throw new Error("Expected at least one parsed Patch file.");
	}

	const selected = selectContinuousDiffViewLines(initial, file.key, {
		end: 1,
		side: "additions",
		start: 1,
	});
	const submitted = submitContinuousDiffViewDraftReviewComment(
		selected,
		"Please simplify this branch."
	);
	const copied = await copyContinuousDiffViewReview(submitted, {
		writeText: (text) => {
			clipboardWrites.push(text);

			return Promise.resolve();
		},
	});

	expect(clipboardWrites).toEqual([
		`a.txt:1 [new]
Please simplify this branch.`,
	]);
	expect(copied.draftReviewCommentState.submittedComments).toEqual([]);
	expect(copied.copyError).toBeUndefined();

	const failed = await copyContinuousDiffViewReview(submitted, {
		writeText: () => Promise.reject(new Error("Clipboard blocked.")),
	});

	expect(failed.draftReviewCommentState.submittedComments).toHaveLength(1);
	expect(failed.copyError).toBe(copyReviewErrorMessage);

	const rejectedClear = confirmClearContinuousDiffViewDraftReviewComments(
		submitted,
		() => false
	);

	expect(rejectedClear.draftReviewCommentState.submittedComments).toHaveLength(
		1
	);

	const confirmedClear = confirmClearContinuousDiffViewDraftReviewComments(
		submitted,
		() => true
	);

	expect(confirmedClear.draftReviewCommentState.submittedComments).toEqual([]);
	expect(confirmedClear.copyError).toBeUndefined();
});
