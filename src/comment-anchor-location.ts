import type {
	DraftReviewCommentAnchor,
	DraftReviewCommentSide,
} from "./review-comments";

type CommentAnchorLocation = Pick<
	DraftReviewCommentAnchor,
	"endLine" | "path" | "side" | "startLine"
>;

const commentAnchorSideLabels = {
	new: "new",
	"old-deleted": "old/deleted",
} satisfies Record<DraftReviewCommentSide, string>;

export const formatCommentAnchorLineRange = ({
	endLine,
	startLine,
}: Pick<CommentAnchorLocation, "endLine" | "startLine">) =>
	startLine === endLine ? String(startLine) : `${startLine}-${endLine}`;

export const formatCommentAnchorSideLabel = (
	side: DraftReviewCommentSide
): string => commentAnchorSideLabels[side];

export const formatCommentAnchorLocation = (anchor: CommentAnchorLocation) =>
	`${anchor.path}:${formatCommentAnchorLineRange(anchor)} [${formatCommentAnchorSideLabel(anchor.side)}]`;
