import type { FileDiffMetadata } from "@pierre/diffs/react";

type ParsedFileDiff = FileDiffMetadata;

export interface FileReviewState {
	readonly collapsed: boolean;
	readonly viewed: boolean;
}

export type FileReviewStates = Record<string, FileReviewState | undefined>;

export const LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD = 200;

export const fileDiffKey = (fileDiff: ParsedFileDiff, index: number) =>
	[
		index,
		fileDiff.prevName,
		fileDiff.name,
		fileDiff.type,
		...fileDiff.hunks.map((hunk) => hunk.hunkSpecs),
	].join("\0");

const renderedSplitHunkRowCount = (fileDiff: ParsedFileDiff) =>
	fileDiff.hunks.reduce((rowCount, hunk) => rowCount + hunk.splitLineCount, 0);

export const shouldDefaultCollapseFileDiff = (fileDiff: ParsedFileDiff) =>
	renderedSplitHunkRowCount(fileDiff) > LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD;

const defaultFileReviewStateFor = (
	fileDiff: ParsedFileDiff
): FileReviewState => ({
	viewed: false,
	collapsed: shouldDefaultCollapseFileDiff(fileDiff),
});

export const initialFileReviewStatesFor = (
	fileDiffs: readonly ParsedFileDiff[]
) =>
	Object.fromEntries(
		fileDiffs.map((fileDiff, index) => [
			fileDiffKey(fileDiff, index),
			defaultFileReviewStateFor(fileDiff),
		])
	) satisfies FileReviewStates;

export const getFileReviewState = (
	states: FileReviewStates,
	fileDiff: ParsedFileDiff,
	index: number
) =>
	states[fileDiffKey(fileDiff, index)] ?? defaultFileReviewStateFor(fileDiff);

const updateFileReviewState = (
	states: FileReviewStates,
	fileDiff: ParsedFileDiff,
	index: number,
	update: (current: FileReviewState) => FileReviewState
): FileReviewStates => ({
	...states,
	[fileDiffKey(fileDiff, index)]: update(
		getFileReviewState(states, fileDiff, index)
	),
});

export const markFileViewed = (
	states: FileReviewStates,
	fileDiff: ParsedFileDiff,
	index: number,
	viewed: boolean
) =>
	updateFileReviewState(states, fileDiff, index, (current) => ({
		viewed,
		collapsed: viewed ? true : current.collapsed,
	}));

export const toggleFileCollapsed = (
	states: FileReviewStates,
	fileDiff: ParsedFileDiff,
	index: number
) =>
	updateFileReviewState(states, fileDiff, index, (current) => ({
		...current,
		collapsed: !current.collapsed,
	}));
