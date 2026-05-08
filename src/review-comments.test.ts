import { expect, test } from "bun:test";
import { parsePatchFiles } from "@pierre/diffs";

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
