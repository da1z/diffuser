import { expect, test } from "bun:test";
import { parsePatchFiles } from "@pierre/diffs";

import {
	getFileReviewState,
	initialFileReviewStatesFor,
	LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD,
	markFileViewed,
	toggleFileCollapsed,
} from "./file-review-state";

const patchWithRenderedContextRows = (fileName: string, rows: number) => {
	const lines = Array.from(
		{ length: rows },
		(_, index) => ` unchanged ${fileName} ${index + 1}`
	).join("\n");

	return `diff --git a/${fileName} b/${fileName}
--- a/${fileName}
+++ b/${fileName}
@@ -1,${rows} +1,${rows} @@
${lines}
`;
};

const fileDiffsFor = (patch: string) =>
	parsePatchFiles(patch).flatMap((parsedPatch) => parsedPatch.files);

const fileDiffWithRenderedContextRows = (fileName: string, rows: number) => {
	const [fileDiff] = fileDiffsFor(patchWithRenderedContextRows(fileName, rows));

	if (fileDiff === undefined) {
		throw new Error(`Expected a file diff for ${fileName}.`);
	}

	return fileDiff;
};

test("default-collapses file diffs above the rendered row threshold", () => {
	const largeFileDiff = fileDiffWithRenderedContextRows(
		"large.txt",
		LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD + 1
	);
	const thresholdFileDiff = fileDiffWithRenderedContextRows(
		"threshold.txt",
		LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD
	);
	const initialStates = initialFileReviewStatesFor([
		largeFileDiff,
		thresholdFileDiff,
	]);

	expect(getFileReviewState(initialStates, largeFileDiff, 0)).toEqual({
		viewed: false,
		collapsed: true,
	});
	expect(getFileReviewState(initialStates, thresholdFileDiff, 1)).toEqual({
		viewed: false,
		collapsed: false,
	});
});

test("uses the default collapse policy when file review state is missing", () => {
	const largeFileDiff = fileDiffWithRenderedContextRows(
		"large.txt",
		LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD + 1
	);

	expect(getFileReviewState({}, largeFileDiff, 0)).toEqual({
		viewed: false,
		collapsed: true,
	});
});

test("marks viewed files collapsed without changing later collapse toggles", () => {
	const fileDiff = fileDiffWithRenderedContextRows(
		"threshold.txt",
		LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD
	);
	const initialStates = initialFileReviewStatesFor([fileDiff]);
	const viewedStates = markFileViewed(initialStates, fileDiff, 0, true);

	expect(getFileReviewState(viewedStates, fileDiff, 0)).toEqual({
		viewed: true,
		collapsed: true,
	});

	const expandedViewedStates = toggleFileCollapsed(viewedStates, fileDiff, 0);

	expect(getFileReviewState(expandedViewedStates, fileDiff, 0)).toEqual({
		viewed: true,
		collapsed: false,
	});
});

test("unmarking viewed files preserves current collapse state", () => {
	const fileDiff = fileDiffWithRenderedContextRows(
		"threshold.txt",
		LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD
	);
	const viewedStates = markFileViewed(
		initialFileReviewStatesFor([fileDiff]),
		fileDiff,
		0,
		true
	);
	const expandedViewedStates = toggleFileCollapsed(viewedStates, fileDiff, 0);
	const unviewedStates = markFileViewed(
		expandedViewedStates,
		fileDiff,
		0,
		false
	);

	expect(getFileReviewState(unviewedStates, fileDiff, 0)).toEqual({
		viewed: false,
		collapsed: false,
	});
});
