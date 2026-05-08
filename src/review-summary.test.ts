import { expect, test } from "bun:test";

import type { SubmittedDraftReviewComment } from "./review-comments";
import { formatReviewSummary } from "./review-summary";

const comment = (
	overrides: Partial<SubmittedDraftReviewComment>
): SubmittedDraftReviewComment => ({
	anchor: {
		fileKey: "0\0src/file.ts",
		fileOrder: 0,
		path: "src/file.ts",
		position: 4,
		side: "new",
		startLine: 4,
		endLine: 4,
	},
	body: "Please simplify this branch.",
	id: "draft-review-comment-1",
	order: 1,
	...overrides,
});

test("formats Draft Review Comments as a plain-text Review Summary", () => {
	const summary = formatReviewSummary([
		comment({
			anchor: {
				fileKey: "0\0src/foo.ts",
				fileOrder: 0,
				path: "src/foo.ts",
				position: 42,
				side: "new",
				startLine: 42,
				endLine: 45,
			},
			body: "Please extract this branch so the happy path stays readable.",
		}),
		comment({
			anchor: {
				fileKey: "1\0src/bar.ts",
				fileOrder: 1,
				path: "src/bar.ts",
				position: 18,
				side: "old-deleted",
				startLine: 18,
				endLine: 18,
			},
			body: "This deletion changes the fallback behavior; is that intentional?",
			id: "draft-review-comment-2",
			order: 2,
		}),
	]);

	expect(summary).toBe(`src/foo.ts:42-45 [new]
Please extract this branch so the happy path stays readable.

src/bar.ts:18 [old/deleted]
This deletion changes the fallback behavior; is that intentional?`);
});

test("orders the Review Summary by rendered Patch position with creation order ties", () => {
	const summary = formatReviewSummary([
		comment({
			anchor: {
				fileKey: "1\0b.ts",
				fileOrder: 1,
				path: "b.ts",
				position: 1,
				side: "new",
				startLine: 1,
				endLine: 1,
			},
			body: "Second file.",
			id: "draft-review-comment-2",
			order: 2,
		}),
		comment({
			body: "First duplicate.",
			id: "draft-review-comment-3",
			order: 3,
		}),
		comment({
			body: "First file.",
			id: "draft-review-comment-1",
			order: 1,
		}),
	]);

	expect(summary).toBe(`src/file.ts:4 [new]
First file.

src/file.ts:4 [new]
First duplicate.

b.ts:1 [new]
Second file.`);
});
