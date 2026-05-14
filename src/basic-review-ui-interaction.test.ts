import { expect, test } from "bun:test";

import {
	createBasicReviewUiInteractionFromPatch,
	type LocalCommentPersistenceLoadAdapter,
} from "./basic-review-ui-interaction";
import { continuousDiffViewDraftReviewCommentCountForFile } from "./continuous-diff-view-interaction";

const noRestoredCommentsAdapter: LocalCommentPersistenceLoadAdapter = {
	loadRestoredSubmittedDraftReviewComments: () => [],
};

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
