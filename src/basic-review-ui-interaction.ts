import {
	type ContinuousDiffViewInteraction,
	createContinuousDiffViewInteraction,
} from "./continuous-diff-view-interaction";
import {
	draftReviewCommentStateWithSubmittedComments,
	type SubmittedDraftReviewComment,
} from "./review-comments";

export interface LocalCommentPersistenceLoadAdapter {
	readonly loadRestoredSubmittedDraftReviewComments: () => readonly SubmittedDraftReviewComment[];
}

export interface BasicReviewUiInteraction {
	readonly continuousDiffView: ContinuousDiffViewInteraction;
	readonly persistenceWarning: string | undefined;
}

export const createBasicReviewUiInteractionFromPatch = (
	patch: string,
	loadAdapter: LocalCommentPersistenceLoadAdapter
): BasicReviewUiInteraction => ({
	continuousDiffView: createContinuousDiffViewInteraction(
		patch,
		draftReviewCommentStateWithSubmittedComments(
			loadAdapter.loadRestoredSubmittedDraftReviewComments()
		)
	),
	persistenceWarning: undefined,
});
