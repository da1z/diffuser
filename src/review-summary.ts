import type { SubmittedDraftReviewComment } from "./review-comments";

const compareSubmittedDraftReviewComments = (
	left: SubmittedDraftReviewComment,
	right: SubmittedDraftReviewComment
) =>
	left.anchor.fileOrder - right.anchor.fileOrder ||
	left.anchor.position - right.anchor.position ||
	left.order - right.order;

const formatReviewSummaryRange = ({
	endLine,
	startLine,
}: {
	readonly endLine: number;
	readonly startLine: number;
}) => (startLine === endLine ? String(startLine) : `${startLine}-${endLine}`);

const formatReviewSummarySide = (comment: SubmittedDraftReviewComment) =>
	comment.anchor.side === "old-deleted" ? "old/deleted" : "new";

const formatReviewSummaryBlock = (comment: SubmittedDraftReviewComment) =>
	`${comment.anchor.path}:${formatReviewSummaryRange(comment.anchor)} [${formatReviewSummarySide(comment)}]\n${comment.body}`;

export const formatReviewSummary = (
	comments: readonly SubmittedDraftReviewComment[]
) =>
	[...comments]
		.sort(compareSubmittedDraftReviewComments)
		.map(formatReviewSummaryBlock)
		.join("\n\n");
