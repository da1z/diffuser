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

test("applies Viewed File and collapse policy transitions", () => {
	const [largeFileDiff] = fileDiffsFor(
		patchWithRenderedContextRows(
			"large.txt",
			LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD + 1
		)
	);
	const [thresholdFileDiff] = fileDiffsFor(
		patchWithRenderedContextRows(
			"threshold.txt",
			LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD
		)
	);

	if (largeFileDiff === undefined || thresholdFileDiff === undefined) {
		throw new Error("Expected file diffs for policy test.");
	}

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

	const viewedStates = markFileViewed(
		initialStates,
		thresholdFileDiff,
		1,
		true
	);

	expect(getFileReviewState(viewedStates, thresholdFileDiff, 1)).toEqual({
		viewed: true,
		collapsed: true,
	});

	const expandedViewedStates = toggleFileCollapsed(
		viewedStates,
		thresholdFileDiff,
		1
	);

	expect(
		getFileReviewState(expandedViewedStates, thresholdFileDiff, 1)
	).toEqual({
		viewed: true,
		collapsed: false,
	});

	const unviewedStates = markFileViewed(
		expandedViewedStates,
		thresholdFileDiff,
		1,
		false
	);

	expect(getFileReviewState(unviewedStates, thresholdFileDiff, 1)).toEqual({
		viewed: false,
		collapsed: false,
	});
});
