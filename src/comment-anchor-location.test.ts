import { expect, test } from "bun:test";

import { formatCommentAnchorLocation } from "./comment-anchor-location";

const anchor = (
	overrides: Partial<Parameters<typeof formatCommentAnchorLocation>[0]>
): Parameters<typeof formatCommentAnchorLocation>[0] => ({
	endLine: 12,
	path: "src/file.ts",
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
