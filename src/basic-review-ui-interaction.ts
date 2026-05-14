import {
	type ContinuousDiffViewInteraction,
	clearContinuousDiffViewDraftReviewComments,
	continuousDiffViewWithCopyClearState,
	createContinuousDiffViewInteraction,
	deleteContinuousDiffViewDraftReviewComment,
	draftReviewCommentCopyClearStateFor,
	submitContinuousDiffViewDraftReviewComment,
} from "./continuous-diff-view-interaction";
import {
	clearDraftReviewCommentsConfirmationMessage,
	copyDraftReviewCommentsToClipboard,
	type ReviewSummaryClipboard,
} from "./draft-review-comment-copy-clear-policy";
import {
	clearPersistedDraftReviewComments,
	type DraftReviewCommentPersistenceScope,
	savePersistedDraftReviewComments,
} from "./local-comment-persistence";
import {
	draftReviewCommentStateWithSubmittedComments,
	type SubmittedDraftReviewComment,
} from "./review-comments";

export interface LocalCommentPersistenceLoadAdapter {
	readonly loadRestoredSubmittedDraftReviewComments: () => readonly SubmittedDraftReviewComment[];
}

export type DraftReviewCommentSubmitPersistenceOutcome =
	| "fail"
	| "ok"
	| "skipped";

/** Tests submit mirroring separately from Review Summary copy mirroring (outcome triple). */
export interface LocalCommentPersistenceSubmitMirrorAdapter {
	readonly mirrorSubmittedDraftReviewCommentsAfterSubmit: (
		submittedComments: readonly SubmittedDraftReviewComment[]
	) => DraftReviewCommentSubmitPersistenceOutcome;
}

export interface BasicReviewUiInteraction {
	readonly continuousDiffView: ContinuousDiffViewInteraction;
	readonly persistenceWarning: string | undefined;
}

/** Persistence mode for mirroring submitted Draft Review Comments to Local Comment Persistence. */
export type DraftReviewCommentPersistenceMode =
	| { readonly kind: "none" }
	| { readonly kind: "storage-unavailable" }
	| {
			readonly kind: "ready";
			readonly scope: DraftReviewCommentPersistenceScope;
	  };

export type PersistenceMirrorSync =
	| { readonly kind: "unchanged" }
	| { readonly kind: "set"; readonly message: string | undefined };

/** Mirroring adapter used when applying Review Summary copy results to persistence. */
export interface LocalCommentPersistenceMirrorAdapter {
	readonly mirrorSubmittedComments: (
		submittedComments: readonly SubmittedDraftReviewComment[]
	) => PersistenceMirrorSync;
}

export const draftReviewCommentPersistenceFailureMessage =
	"Draft comments could not be saved in this browser. They will be lost if you reload the page.";

const persistenceWarningUnlessOk = (ok: boolean): string | undefined => {
	if (ok) {
		return;
	}

	return draftReviewCommentPersistenceFailureMessage;
};

export const persistenceWarningAfterMirrorSync = (
	previousWarning: string | undefined,
	sync: PersistenceMirrorSync
): string | undefined => {
	if (sync.kind === "set") {
		return sync.message;
	}

	return previousWarning;
};

export type MirrorSubmittedDraftReviewCommentsToPersistence = (
	nextContinuousDiffView: ContinuousDiffViewInteraction
) => PersistenceMirrorSync;

export const mirrorSubmittedDraftReviewCommentsSync = (
	persistence: DraftReviewCommentPersistenceMode,
	submittedComments: readonly SubmittedDraftReviewComment[]
): PersistenceMirrorSync => {
	if (persistence.kind === "none") {
		return { kind: "unchanged" };
	}

	if (persistence.kind === "storage-unavailable") {
		if (submittedComments.length > 0) {
			return {
				kind: "set",
				message: draftReviewCommentPersistenceFailureMessage,
			};
		}

		return {
			kind: "set",
			message: undefined,
		};
	}

	const scope = persistence.scope;

	if (submittedComments.length === 0) {
		const cleared = clearPersistedDraftReviewComments(scope);

		return {
			kind: "set",
			message: persistenceWarningUnlessOk(cleared.ok),
		};
	}

	const saved = savePersistedDraftReviewComments(scope, submittedComments);

	return {
		kind: "set",
		message: persistenceWarningUnlessOk(saved.ok),
	};
};

export const basicReviewUiAfterDeleteSubmittedDraftReviewComment = (
	state: BasicReviewUiInteraction,
	commentId: string,
	persistence: DraftReviewCommentPersistenceMode
): BasicReviewUiInteraction => {
	const nextView = deleteContinuousDiffViewDraftReviewComment(
		state.continuousDiffView,
		commentId
	);
	const submittedComments = nextView.draftReviewCommentState.submittedComments;
	const sync = mirrorSubmittedDraftReviewCommentsSync(
		persistence,
		submittedComments
	);

	return {
		continuousDiffView: nextView,
		persistenceWarning: persistenceWarningAfterMirrorSync(
			state.persistenceWarning,
			sync
		),
	};
};

export const requestClearSubmittedDraftReviewComments = (
	review: BasicReviewUiInteraction,
	confirm: (message: string) => boolean,
	mirrorSubmittedDraftReviewCommentsToPersistence: MirrorSubmittedDraftReviewCommentsToPersistence
): BasicReviewUiInteraction => {
	if (!confirm(clearDraftReviewCommentsConfirmationMessage)) {
		return review;
	}

	const nextView = clearContinuousDiffViewDraftReviewComments(
		review.continuousDiffView
	);
	const sync = mirrorSubmittedDraftReviewCommentsToPersistence(nextView);

	return {
		continuousDiffView: nextView,
		persistenceWarning: persistenceWarningAfterMirrorSync(
			review.persistenceWarning,
			sync
		),
	};
};

const persistenceWarningAfterDraftReviewSubmitOutcome = (
	previousWarning: string | undefined,
	outcome: DraftReviewCommentSubmitPersistenceOutcome
): string | undefined => {
	switch (outcome) {
		case "ok":
			return;
		case "fail":
			return draftReviewCommentPersistenceFailureMessage;
		case "skipped":
			return previousWarning;
		default:
			return (outcome satisfies never) ? previousWarning : previousWarning;
	}
};

export const submitDraftReviewCommentThroughBasicReviewUi = (
	interaction: BasicReviewUiInteraction,
	body: string,
	mirrorAdapter: LocalCommentPersistenceSubmitMirrorAdapter
): BasicReviewUiInteraction => {
	const nextContinuousDiffView = submitContinuousDiffViewDraftReviewComment(
		interaction.continuousDiffView,
		body
	);
	const outcome = mirrorAdapter.mirrorSubmittedDraftReviewCommentsAfterSubmit(
		nextContinuousDiffView.draftReviewCommentState.submittedComments
	);

	return {
		continuousDiffView: nextContinuousDiffView,
		persistenceWarning: persistenceWarningAfterDraftReviewSubmitOutcome(
			interaction.persistenceWarning,
			outcome
		),
	};
};

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

export const copyReviewSummaryThroughBasicReviewUi = async (
	basic: BasicReviewUiInteraction,
	clipboard: ReviewSummaryClipboard | undefined,
	persistenceMirror: LocalCommentPersistenceMirrorAdapter
): Promise<BasicReviewUiInteraction> => {
	const interaction = basic.continuousDiffView;
	const copyClear = await copyDraftReviewCommentsToClipboard(
		draftReviewCommentCopyClearStateFor(interaction),
		clipboard
	);

	const nextContinuousDiffView: ContinuousDiffViewInteraction =
		continuousDiffViewWithCopyClearState(interaction, copyClear);

	let persistenceWarning = basic.persistenceWarning;

	if (copyClear.copyError === undefined) {
		persistenceWarning = persistenceWarningAfterMirrorSync(
			basic.persistenceWarning,
			persistenceMirror.mirrorSubmittedComments(
				nextContinuousDiffView.draftReviewCommentState.submittedComments
			)
		);
	}

	return {
		continuousDiffView: nextContinuousDiffView,
		persistenceWarning,
	};
};
