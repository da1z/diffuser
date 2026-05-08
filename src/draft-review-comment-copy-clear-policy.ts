import {
	clearSubmittedDraftReviewComments,
	type DraftReviewCommentState,
} from "./review-comments";
import { formatReviewSummary } from "./review-summary";

export interface DraftReviewCommentCopyClearState {
	readonly copyError: string | undefined;
	readonly draftReviewCommentState: DraftReviewCommentState;
}

export interface ReviewSummaryClipboard {
	readonly writeText: (text: string) => Promise<void>;
}

export const copyReviewErrorMessage = "Could not copy review.";
export const clearDraftReviewCommentsConfirmationMessage =
	"Clear all draft review comments?";

export const clearDraftReviewComments = (
	state: DraftReviewCommentCopyClearState
): DraftReviewCommentCopyClearState => ({
	copyError: undefined,
	draftReviewCommentState: clearSubmittedDraftReviewComments(
		state.draftReviewCommentState
	),
});

const keepDraftReviewCommentsAfterCopyFailure = (
	state: DraftReviewCommentCopyClearState
): DraftReviewCommentCopyClearState => ({
	...state,
	copyError: copyReviewErrorMessage,
});

export const copyDraftReviewCommentsToClipboard = async (
	state: DraftReviewCommentCopyClearState,
	clipboard: ReviewSummaryClipboard | undefined
): Promise<DraftReviewCommentCopyClearState> => {
	if (clipboard === undefined) {
		return keepDraftReviewCommentsAfterCopyFailure(state);
	}

	try {
		await clipboard.writeText(
			formatReviewSummary(state.draftReviewCommentState.submittedComments)
		);
	} catch {
		return keepDraftReviewCommentsAfterCopyFailure(state);
	}

	return clearDraftReviewComments(state);
};

export const confirmClearDraftReviewComments = (
	state: DraftReviewCommentCopyClearState,
	confirm: (message: string) => boolean
): DraftReviewCommentCopyClearState =>
	confirm(clearDraftReviewCommentsConfirmationMessage)
		? clearDraftReviewComments(state)
		: state;
