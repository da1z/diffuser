import { expect, test } from "bun:test";
import { parsePatchFiles, type SelectedLineRange } from "@pierre/diffs";

import {
	addSubmittedDraftReviewComment,
	clearSubmittedDraftReviewComments,
	type DraftReviewCommentState,
	deleteSubmittedDraftReviewComment,
	draftReviewCommentAnchorForSelection,
	draftReviewCommentCountByFileKey,
	submitDraftReviewComment,
} from "./review-comments";

const commentState = (): DraftReviewCommentState => ({
	nextCommentId: 1,
	submittedComments: [],
});

const anchor = {
	fileKey: "0\0src/file.ts",
	fileOrder: 0,
	path: "src/file.ts",
	position: 10,
	side: "new",
	startLine: 4,
	endLine: 4,
} as const;

const selectionConformancePatch = `diff --git a/src/old.ts b/src/new.ts
similarity index 90%
rename from src/old.ts
rename to src/new.ts
--- a/src/old.ts
+++ b/src/new.ts
@@ -10,6 +10,7 @@
 shared before
-old first
-old second
+new first
+new second
 shared middle
 shared after
+added tail
`;

const anchorForSelection = (selection: SelectedLineRange) => {
	const fileDiff = parsePatchFiles(selectionConformancePatch)[0]?.files[0];

	if (fileDiff === undefined) {
		throw new Error("Expected parsed file diff.");
	}

	return draftReviewCommentAnchorForSelection({
		fileDiff,
		fileKey: "0\0src/new.ts",
		fileOrder: 0,
		selection,
	});
};

test("stores non-empty Draft Review Comments and ignores blank submissions", () => {
	const state = commentState();

	const afterBlank = submitDraftReviewComment(state, {
		anchor,
		body: "   ",
	});
	const afterComment = submitDraftReviewComment(afterBlank, {
		anchor,
		body: "  Please simplify this branch.  ",
	});

	expect(afterBlank.submittedComments).toEqual([]);
	expect(afterComment.submittedComments).toEqual([
		{
			anchor,
			body: "Please simplify this branch.",
			id: "draft-review-comment-1",
			order: 1,
		},
	]);
	expect(afterComment.nextCommentId).toBe(2);
});

test("keeps duplicate anchors independent and counts submitted comments per file", () => {
	const first = addSubmittedDraftReviewComment(commentState(), {
		anchor,
		body: "First concern.",
	});
	const second = addSubmittedDraftReviewComment(first, {
		anchor,
		body: "Second concern.",
	});
	const afterDelete = deleteSubmittedDraftReviewComment(
		second,
		"draft-review-comment-1"
	);

	expect(second.submittedComments).toHaveLength(2);
	expect(draftReviewCommentCountByFileKey(second)).toEqual({
		"0\0src/file.ts": 2,
	});
	expect(afterDelete.submittedComments.map((comment) => comment.body)).toEqual([
		"Second concern.",
	]);
	expect(
		clearSubmittedDraftReviewComments(afterDelete).submittedComments
	).toEqual([]);
});

test("normalizes Pierre selections into side-aware Comment Anchors", () => {
	const patch = `diff --git a/src/old.ts b/src/new.ts
similarity index 90%
rename from src/old.ts
rename to src/new.ts
--- a/src/old.ts
+++ b/src/new.ts
@@ -10,3 +10,3 @@
 shared before
-old value
+new value
 shared after
`;
	const fileDiff = parsePatchFiles(patch)[0]?.files[0];

	expect(fileDiff).toBeDefined();
	if (fileDiff === undefined) {
		throw new Error("Expected parsed file diff.");
	}
	expect(
		draftReviewCommentAnchorForSelection({
			fileDiff,
			fileKey: "0\0src/new.ts",
			fileOrder: 0,
			selection: { start: 11, end: 11, side: "deletions" },
		})
	).toMatchObject({
		path: "src/old.ts",
		side: "old-deleted",
		startLine: 11,
		endLine: 11,
	});
	expect(
		draftReviewCommentAnchorForSelection({
			fileDiff,
			fileKey: "0\0src/new.ts",
			fileOrder: 0,
			selection: { start: 11, end: 11, side: "additions" },
		})
	).toMatchObject({
		path: "src/new.ts",
		side: "new",
		startLine: 11,
		endLine: 11,
	});
	expect(
		draftReviewCommentAnchorForSelection({
			fileDiff,
			fileKey: "0\0src/new.ts",
			fileOrder: 0,
			selection: { start: 10, end: 10, side: "deletions" },
		})
	).toMatchObject({
		path: "src/new.ts",
		side: "new",
		startLine: 10,
		endLine: 10,
	});
});

test("rejects invalid Pierre selections without creating Comment Anchors", () => {
	const invalidSelections: readonly SelectedLineRange[] = [
		{ end: Number.POSITIVE_INFINITY, side: "additions", start: 11 },
		{ end: 11, side: "additions", start: Number.NaN },
		{ end: 11.5, side: "additions", start: 11 },
		{
			end: Number.MAX_SAFE_INTEGER,
			side: "deletions",
			start: -Number.MAX_SAFE_INTEGER,
		},
	];

	for (const selection of invalidSelections) {
		expect(anchorForSelection(selection)).toBeUndefined();
	}
});

test("conforms Pierre side-by-side selections to exported Comment Anchors", () => {
	const cases: readonly {
		readonly expected: ReturnType<typeof anchorForSelection>;
		readonly name: string;
		readonly selection: SelectedLineRange;
	}[] = [
		{
			name: "added line",
			selection: { start: 15, end: 15, side: "additions" },
			expected: {
				endLine: 15,
				fileKey: "0\0src/new.ts",
				fileOrder: 0,
				path: "src/new.ts",
				position: 14,
				side: "new",
				startLine: 15,
			},
		},
		{
			name: "deleted line",
			selection: { start: 11, end: 11, side: "deletions" },
			expected: {
				endLine: 11,
				fileKey: "0\0src/new.ts",
				fileOrder: 0,
				path: "src/old.ts",
				position: 10,
				side: "old-deleted",
				startLine: 11,
			},
		},
		{
			name: "unchanged context from the new side",
			selection: { start: 13, end: 14, side: "additions" },
			expected: {
				endLine: 14,
				fileKey: "0\0src/new.ts",
				fileOrder: 0,
				path: "src/new.ts",
				position: 12,
				side: "new",
				startLine: 13,
			},
		},
		{
			name: "unchanged context from the old side",
			selection: { start: 14, end: 13, side: "deletions" },
			expected: {
				endLine: 14,
				fileKey: "0\0src/new.ts",
				fileOrder: 0,
				path: "src/new.ts",
				position: 12,
				side: "new",
				startLine: 13,
			},
		},
		{
			name: "same-side multi-line addition range",
			selection: { start: 12, end: 11, side: "additions" },
			expected: {
				endLine: 12,
				fileKey: "0\0src/new.ts",
				fileOrder: 0,
				path: "src/new.ts",
				position: 10,
				side: "new",
				startLine: 11,
			},
		},
		{
			name: "same-side multi-line deletion range",
			selection: { start: 12, end: 11, side: "deletions" },
			expected: {
				endLine: 12,
				fileKey: "0\0src/new.ts",
				fileOrder: 0,
				path: "src/old.ts",
				position: 10,
				side: "old-deleted",
				startLine: 11,
			},
		},
		{
			name: "cross-side range",
			selection: {
				end: 12,
				endSide: "additions",
				side: "deletions",
				start: 11,
			},
			expected: undefined,
		},
		{
			name: "missing selection side",
			selection: { start: 11, end: 12 },
			expected: undefined,
		},
		{
			name: "non-rendered line",
			selection: { start: 99, end: 99, side: "additions" },
			expected: undefined,
		},
		{
			name: "old-side range crossing deleted and context anchors",
			selection: { start: 12, end: 13, side: "deletions" },
			expected: undefined,
		},
	];

	for (const { expected, name, selection } of cases) {
		expect(anchorForSelection(selection), name).toEqual(expected);
	}
});
