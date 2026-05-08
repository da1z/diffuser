import { expect, test } from "bun:test";

import {
	clearDraftReviewCommentsConfirmationMessage,
	confirmClearDraftReviewComments,
	copyDraftReviewCommentsToClipboard,
	copyReviewErrorMessage,
	type DraftReviewCommentCopyClearState,
} from "./draft-review-comment-copy-clear-policy";

const draftReviewCommentCopyClearState =
	(): DraftReviewCommentCopyClearState => ({
		copyError: copyReviewErrorMessage,
		draftReviewCommentState: {
			nextCommentId: 2,
			submittedComments: [
				{
					anchor: {
						fileKey: "0\0src/file.ts",
						fileOrder: 0,
						path: "src/file.ts",
						position: 10,
						side: "new",
						startLine: 4,
						endLine: 4,
					},
					body: "Please simplify this branch.",
					id: "draft-review-comment-1",
					order: 1,
				},
			],
		},
	});

test("successful Review Summary copy clears submitted Draft Review Comments and copy errors", async () => {
	const clipboardWrites: string[] = [];
	const result = await copyDraftReviewCommentsToClipboard(
		draftReviewCommentCopyClearState(),
		{
			writeText: (text) => {
				clipboardWrites.push(text);

				return Promise.resolve();
			},
		}
	);

	expect(clipboardWrites).toEqual([
		`src/file.ts:4 [new]
Please simplify this branch.`,
	]);
	expect(result).toEqual({
		copyError: undefined,
		draftReviewCommentState: {
			nextCommentId: 2,
			submittedComments: [],
		},
	});
});

test("failed Review Summary copy keeps submitted Draft Review Comments and surfaces the copy error", async () => {
	const state = draftReviewCommentCopyClearState();
	const result = await copyDraftReviewCommentsToClipboard(state, {
		writeText: () => Promise.reject(new Error("Clipboard blocked.")),
	});

	expect(result).toEqual({
		copyError: copyReviewErrorMessage,
		draftReviewCommentState: state.draftReviewCommentState,
	});
});

test("unavailable clipboard keeps submitted Draft Review Comments and surfaces the copy error", async () => {
	const state = draftReviewCommentCopyClearState();
	const result = await copyDraftReviewCommentsToClipboard(state, undefined);

	expect(result).toEqual({
		copyError: copyReviewErrorMessage,
		draftReviewCommentState: state.draftReviewCommentState,
	});
});

test("manual clear removes submitted Draft Review Comments only after confirmation", () => {
	const confirmationMessages: string[] = [];
	const state = draftReviewCommentCopyClearState();
	const cancelled = confirmClearDraftReviewComments(state, (message) => {
		confirmationMessages.push(message);

		return false;
	});
	const confirmed = confirmClearDraftReviewComments(state, (message) => {
		confirmationMessages.push(message);

		return true;
	});

	expect(confirmationMessages).toEqual([
		clearDraftReviewCommentsConfirmationMessage,
		clearDraftReviewCommentsConfirmationMessage,
	]);
	expect(cancelled).toBe(state);
	expect(confirmed).toEqual({
		copyError: undefined,
		draftReviewCommentState: {
			nextCommentId: 2,
			submittedComments: [],
		},
	});
});
