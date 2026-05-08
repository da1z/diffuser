import type {
	DraftReviewCommentAnchor,
	DraftReviewCommentSide,
} from "./review-comments";

type CommentAnchorLocation = Pick<
	DraftReviewCommentAnchor,
	"endLine" | "path" | "side" | "startLine"
>;

export const formatCommentAnchorLineRange = ({
	endLine,
	startLine,
}: Pick<CommentAnchorLocation, "endLine" | "startLine">) =>
	startLine === endLine ? String(startLine) : `${startLine}-${endLine}`;

export const formatCommentAnchorSideLabel = (
	side: DraftReviewCommentSide
): string => (side === "old-deleted" ? "old/deleted" : "new");

export const formatCommentAnchorLocation = (anchor: CommentAnchorLocation) =>
	`${anchor.path}:${formatCommentAnchorLineRange(anchor)} [${formatCommentAnchorSideLabel(anchor.side)}]`;
