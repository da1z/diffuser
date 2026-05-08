import { expect, test } from "bun:test";

import { formatCommentAnchorLocation } from "./comment-anchor-location";
import type { DraftReviewCommentAnchor } from "./review-comments";

const anchor = (
	overrides: Partial<DraftReviewCommentAnchor>
): DraftReviewCommentAnchor => ({
	endLine: 12,
	fileKey: "0\0src/file.ts",
	fileOrder: 0,
	path: "src/file.ts",
	position: 12,
	side: "new",
	startLine: 12,
	...overrides,
});

test("formats Comment Anchor locations with shared side and range wording", () => {
	expect(formatCommentAnchorLocation(anchor({}))).toBe("src/file.ts:12 [new]");
	expect(formatCommentAnchorLocation(anchor({ endLine: 14 }))).toBe(
		"src/file.ts:12-14 [new]"
	);
	expect(
		formatCommentAnchorLocation(
			anchor({
				path: "src/removed.ts",
				side: "old-deleted",
			})
		)
	).toBe("src/removed.ts:12 [old/deleted]");
	expect(
		formatCommentAnchorLocation(
			anchor({
				endLine: 14,
				path: "src/removed.ts",
				side: "old-deleted",
			})
		)
	).toBe("src/removed.ts:12-14 [old/deleted]");
});
