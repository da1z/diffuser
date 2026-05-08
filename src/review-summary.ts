import { formatCommentAnchorLocation } from "./comment-anchor-location";
import type { SubmittedDraftReviewComment } from "./review-comments";

const compareSubmittedDraftReviewComments = (
	left: SubmittedDraftReviewComment,
	right: SubmittedDraftReviewComment
) =>
	left.anchor.fileOrder - right.anchor.fileOrder ||
	left.anchor.position - right.anchor.position ||
	left.order - right.order;

const formatReviewSummaryBlock = (comment: SubmittedDraftReviewComment) =>
	`${formatCommentAnchorLocation(comment.anchor)}\n${comment.body}`;

export const formatReviewSummary = (
	comments: readonly SubmittedDraftReviewComment[]
) =>
	[...comments]
		.sort(compareSubmittedDraftReviewComments)
		.map(formatReviewSummaryBlock)
		.join("\n\n");
