import type { SelectedLineRange } from "@pierre/diffs";
import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs/react";

import {
	clearDraftReviewComments,
	clearDraftReviewCommentsConfirmationMessage,
	copyDraftReviewCommentsToClipboard,
	type DraftReviewCommentCopyClearState,
	type ReviewSummaryClipboard,
} from "./draft-review-comment-copy-clear-policy";
import {
	type FileReviewState,
	type FileReviewStates,
	fileDiffKey,
	getFileReviewState,
	initialFileReviewStatesFor,
	markFileViewed,
	toggleFileCollapsed,
} from "./file-review-state";
import {
	type DraftReviewCommentAnchor,
	type DraftReviewCommentState,
	deleteSubmittedDraftReviewComment,
	draftReviewCommentAnchorForSelection,
	draftReviewCommentCountByFileKey,
	emptyDraftReviewCommentState,
	submitDraftReviewComment,
} from "./review-comments";

type ParsedFileDiff = FileDiffMetadata;

export interface ContinuousDiffViewFile {
	readonly fileDiff: ParsedFileDiff;
	readonly index: number;
	readonly key: string;
	readonly label: string;
}

export interface ContinuousDiffViewInteraction {
	readonly activeDraftReviewCommentAnchor: DraftReviewCommentAnchor | undefined;
	readonly activeDraftReviewCommentSelection: SelectedLineRange | null;
	readonly copyError: string | undefined;
	readonly draftReviewCommentState: DraftReviewCommentState;
	readonly fileReviewStates: FileReviewStates;
	readonly files: readonly ContinuousDiffViewFile[];
}

const parsedFileDiffsFor = (patch: string) =>
	parsePatchFiles(patch).flatMap((parsedPatch) => parsedPatch.files);

const fileReviewLabel = (fileDiff: ParsedFileDiff) =>
	fileDiff.name ?? fileDiff.prevName ?? "file";

const fileForKey = (
	interaction: ContinuousDiffViewInteraction,
	fileKey: string
) => interaction.files.find((file) => file.key === fileKey);

const cancelActiveDraftReviewComment = (
	interaction: ContinuousDiffViewInteraction
): ContinuousDiffViewInteraction => ({
	...interaction,
	activeDraftReviewCommentAnchor: undefined,
	activeDraftReviewCommentSelection: null,
});

export const cancelContinuousDiffViewDraftReviewComment = (
	interaction: ContinuousDiffViewInteraction
): ContinuousDiffViewInteraction => cancelActiveDraftReviewComment(interaction);

export const continuousDiffViewWithCopyClearState = (
	interaction: ContinuousDiffViewInteraction,
	copyClearState: DraftReviewCommentCopyClearState
): ContinuousDiffViewInteraction => ({
	...interaction,
	copyError: copyClearState.copyError,
	draftReviewCommentState: copyClearState.draftReviewCommentState,
});

export const draftReviewCommentCopyClearStateFor = (
	interaction: ContinuousDiffViewInteraction
): DraftReviewCommentCopyClearState => ({
	copyError: interaction.copyError,
	draftReviewCommentState: interaction.draftReviewCommentState,
});

export const createContinuousDiffViewInteraction = (
	patch: string,
	initialDraftReviewCommentState: DraftReviewCommentState = emptyDraftReviewCommentState()
): ContinuousDiffViewInteraction => {
	const fileDiffs = parsedFileDiffsFor(patch);

	return {
		activeDraftReviewCommentAnchor: undefined,
		activeDraftReviewCommentSelection: null,
		copyError: undefined,
		draftReviewCommentState: initialDraftReviewCommentState,
		files: fileDiffs.map((fileDiff, index) => ({
			fileDiff,
			index,
			key: fileDiffKey(fileDiff, index),
			label: fileReviewLabel(fileDiff),
		})),
		fileReviewStates: initialFileReviewStatesFor(fileDiffs),
	};
};

export const continuousDiffViewFileState = (
	interaction: ContinuousDiffViewInteraction,
	fileKey: string
): FileReviewState | undefined => {
	const file = fileForKey(interaction, fileKey);

	if (file === undefined) {
		return;
	}

	return getFileReviewState(
		interaction.fileReviewStates,
		file.fileDiff,
		file.index
	);
};

export const markContinuousDiffViewFileViewed = (
	interaction: ContinuousDiffViewInteraction,
	fileKey: string,
	viewed: boolean
): ContinuousDiffViewInteraction => {
	const file = fileForKey(interaction, fileKey);

	if (file === undefined) {
		return interaction;
	}

	return {
		...interaction,
		fileReviewStates: markFileViewed(
			interaction.fileReviewStates,
			file.fileDiff,
			file.index,
			viewed
		),
	};
};

export const toggleContinuousDiffViewFileCollapsed = (
	interaction: ContinuousDiffViewInteraction,
	fileKey: string
): ContinuousDiffViewInteraction => {
	const file = fileForKey(interaction, fileKey);

	if (file === undefined) {
		return interaction;
	}

	return {
		...interaction,
		fileReviewStates: toggleFileCollapsed(
			interaction.fileReviewStates,
			file.fileDiff,
			file.index
		),
	};
};

export const continuousDiffViewSelectedLinesForFile = (
	interaction: ContinuousDiffViewInteraction,
	fileKey: string
) =>
	interaction.activeDraftReviewCommentAnchor?.fileKey === fileKey
		? interaction.activeDraftReviewCommentSelection
		: null;

export const continuousDiffViewDraftReviewCommentCountsByFileKey = (
	interaction: ContinuousDiffViewInteraction
) => draftReviewCommentCountByFileKey(interaction.draftReviewCommentState);

export const continuousDiffViewDraftReviewCommentCountForFile = (
	interaction: ContinuousDiffViewInteraction,
	fileKey: string
) =>
	continuousDiffViewDraftReviewCommentCountsByFileKey(interaction)[fileKey] ??
	0;

export const selectContinuousDiffViewLines = (
	interaction: ContinuousDiffViewInteraction,
	fileKey: string,
	selection: SelectedLineRange | null
): ContinuousDiffViewInteraction => {
	if (selection === null) {
		return cancelActiveDraftReviewComment(interaction);
	}

	const file = fileForKey(interaction, fileKey);

	if (file === undefined) {
		return cancelActiveDraftReviewComment(interaction);
	}

	const anchor = draftReviewCommentAnchorForSelection({
		fileDiff: file.fileDiff,
		fileKey: file.key,
		fileOrder: file.index,
		selection,
	});

	if (anchor === undefined) {
		return cancelActiveDraftReviewComment(interaction);
	}

	return {
		...interaction,
		activeDraftReviewCommentAnchor: anchor,
		activeDraftReviewCommentSelection: selection,
		copyError: undefined,
	};
};

export const submitContinuousDiffViewDraftReviewComment = (
	interaction: ContinuousDiffViewInteraction,
	body: string
): ContinuousDiffViewInteraction => {
	if (interaction.activeDraftReviewCommentAnchor === undefined) {
		return interaction;
	}

	return {
		...cancelActiveDraftReviewComment(interaction),
		draftReviewCommentState: submitDraftReviewComment(
			interaction.draftReviewCommentState,
			{
				anchor: interaction.activeDraftReviewCommentAnchor,
				body,
			}
		),
	};
};

export const deleteContinuousDiffViewDraftReviewComment = (
	interaction: ContinuousDiffViewInteraction,
	commentId: string
): ContinuousDiffViewInteraction => ({
	...interaction,
	draftReviewCommentState: deleteSubmittedDraftReviewComment(
		interaction.draftReviewCommentState,
		commentId
	),
});

export const copyContinuousDiffViewReview = async (
	interaction: ContinuousDiffViewInteraction,
	clipboard: ReviewSummaryClipboard | undefined
): Promise<ContinuousDiffViewInteraction> =>
	continuousDiffViewWithCopyClearState(
		interaction,
		await copyDraftReviewCommentsToClipboard(
			draftReviewCommentCopyClearStateFor(interaction),
			clipboard
		)
	);

export const clearContinuousDiffViewDraftReviewComments = (
	interaction: ContinuousDiffViewInteraction
): ContinuousDiffViewInteraction =>
	continuousDiffViewWithCopyClearState(
		interaction,
		clearDraftReviewComments(draftReviewCommentCopyClearStateFor(interaction))
	);

export const confirmClearContinuousDiffViewDraftReviewComments = (
	interaction: ContinuousDiffViewInteraction,
	confirm: (message: string) => boolean
): ContinuousDiffViewInteraction => {
	if (!confirm(clearDraftReviewCommentsConfirmationMessage)) {
		return interaction;
	}

	return clearContinuousDiffViewDraftReviewComments(interaction);
};
