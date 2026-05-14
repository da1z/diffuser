import type {
	FileDiffMetadata,
	Hunk,
	SelectedLineRange,
	SelectionSide,
} from "@pierre/diffs";

export type DraftReviewCommentSide = "new" | "old-deleted";

export interface DraftReviewCommentAnchor {
	readonly endLine: number;
	readonly fileKey: string;
	readonly fileOrder: number;
	readonly path: string;
	readonly position: number;
	readonly side: DraftReviewCommentSide;
	readonly startLine: number;
}

export interface SubmittedDraftReviewComment {
	readonly anchor: DraftReviewCommentAnchor;
	readonly body: string;
	readonly id: string;
	readonly order: number;
}

export interface DraftReviewCommentState {
	readonly nextCommentId: number;
	readonly submittedComments: readonly SubmittedDraftReviewComment[];
}

export const emptyDraftReviewCommentState = (): DraftReviewCommentState => ({
	nextCommentId: 1,
	submittedComments: [],
});

const draftReviewCommentIdPattern = /^draft-review-comment-(\d+)$/;

const commentIdNumber = (commentId: string) => {
	const match = draftReviewCommentIdPattern.exec(commentId);

	return match === null ? 0 : Number(match[1]);
};

const compareSubmittedDraftReviewCommentsByOrder = (
	left: SubmittedDraftReviewComment,
	right: SubmittedDraftReviewComment
) => {
	const orderDifference = left.order - right.order;

	if (orderDifference !== 0) {
		return orderDifference;
	}

	const idNumberDifference =
		commentIdNumber(left.id) - commentIdNumber(right.id);

	if (idNumberDifference !== 0) {
		return idNumberDifference;
	}

	return left.id.localeCompare(right.id);
};

export const draftReviewCommentStateWithSubmittedComments = (
	submittedComments: readonly SubmittedDraftReviewComment[]
): DraftReviewCommentState => {
	const normalizedSubmittedComments = [...submittedComments].sort(
		compareSubmittedDraftReviewCommentsByOrder
	);

	const highestCommentNumber = Math.max(
		0,
		...normalizedSubmittedComments.map((comment) =>
			Math.max(comment.order, commentIdNumber(comment.id))
		)
	);

	return {
		nextCommentId: highestCommentNumber + 1,
		submittedComments: normalizedSubmittedComments,
	};
};

export const addSubmittedDraftReviewComment = (
	state: DraftReviewCommentState,
	{
		anchor,
		body,
	}: {
		readonly anchor: DraftReviewCommentAnchor;
		readonly body: string;
	}
): DraftReviewCommentState => {
	const id = `draft-review-comment-${state.nextCommentId}`;

	return {
		nextCommentId: state.nextCommentId + 1,
		submittedComments: [
			...state.submittedComments,
			{
				anchor,
				body,
				id,
				order: state.nextCommentId,
			},
		],
	};
};

export const submitDraftReviewComment = (
	state: DraftReviewCommentState,
	{
		anchor,
		body,
	}: {
		readonly anchor: DraftReviewCommentAnchor;
		readonly body: string;
	}
): DraftReviewCommentState => {
	const trimmedBody = body.trim();

	if (trimmedBody.length === 0) {
		return state;
	}

	return addSubmittedDraftReviewComment(state, {
		anchor,
		body: trimmedBody,
	});
};

export const deleteSubmittedDraftReviewComment = (
	state: DraftReviewCommentState,
	commentId: string
): DraftReviewCommentState => ({
	...state,
	submittedComments: state.submittedComments.filter(
		(comment) => comment.id !== commentId
	),
});

export const clearSubmittedDraftReviewComments = (
	state: DraftReviewCommentState
): DraftReviewCommentState => ({
	...state,
	submittedComments: [],
});

export const draftReviewCommentCountByFileKey = (
	state: Pick<DraftReviewCommentState, "submittedComments">
) =>
	state.submittedComments.reduce<Record<string, number>>((counts, comment) => {
		counts[comment.anchor.fileKey] = (counts[comment.anchor.fileKey] ?? 0) + 1;

		return counts;
	}, {});

type RenderedLineKind = "addition" | "context" | "deletion";

interface RenderedLinePosition {
	readonly additionLine: number | undefined;
	readonly deletionLine: number | undefined;
	readonly kind: RenderedLineKind;
	readonly renderedPosition: number;
}

interface RenderedLinePositions {
	readonly additions: ReadonlyMap<number, RenderedLinePosition>;
	readonly deletions: ReadonlyMap<number, RenderedLinePosition>;
}

const ascendingRange = (
	start: number,
	end: number
): readonly [number, number] => (start <= end ? [start, end] : [end, start]);

const rangeNumbers = (start: number, end: number) =>
	Array.from({ length: end - start + 1 }, (_, index) => start + index);

const isDefined = <Value>(value: Value | undefined): value is Value =>
	value !== undefined;

const isSafeLineNumber = (lineNumber: number) =>
	Number.isSafeInteger(lineNumber);

const selectionRangeLength = (start: number, end: number) => end - start + 1;

const isSelectableLineRange = ({
	availableLineCount,
	end,
	start,
}: {
	readonly availableLineCount: number;
	readonly end: number;
	readonly start: number;
}) => {
	const rangeLength = selectionRangeLength(start, end);

	return (
		isSafeLineNumber(start) &&
		isSafeLineNumber(end) &&
		Number.isSafeInteger(rangeLength) &&
		rangeLength > 0 &&
		rangeLength <= availableLineCount
	);
};

const renderedLinePositionsForHunk = (
	hunk: Hunk,
	positions: {
		readonly additions: Map<number, RenderedLinePosition>;
		readonly deletions: Map<number, RenderedLinePosition>;
	}
) => {
	let additionLine = hunk.additionStart;
	let deletionLine = hunk.deletionStart;
	let renderedPosition = hunk.splitLineStart;

	for (const content of hunk.hunkContent) {
		if (content.type === "context") {
			for (let offset = 0; offset < content.lines; offset += 1) {
				const position = {
					additionLine: additionLine + offset,
					deletionLine: deletionLine + offset,
					kind: "context",
					renderedPosition: renderedPosition + offset,
				} as const;
				positions.additions.set(position.additionLine, position);
				positions.deletions.set(position.deletionLine, position);
			}
			additionLine += content.lines;
			deletionLine += content.lines;
			renderedPosition += content.lines;
			continue;
		}

		for (let offset = 0; offset < content.deletions; offset += 1) {
			const position = {
				additionLine: undefined,
				deletionLine: deletionLine + offset,
				kind: "deletion",
				renderedPosition: renderedPosition + offset,
			} as const;
			positions.deletions.set(position.deletionLine, position);
		}
		for (let offset = 0; offset < content.additions; offset += 1) {
			const position = {
				additionLine: additionLine + offset,
				deletionLine: undefined,
				kind: "addition",
				renderedPosition: renderedPosition + offset,
			} as const;
			positions.additions.set(position.additionLine, position);
		}
		additionLine += content.additions;
		deletionLine += content.deletions;
		renderedPosition += Math.max(content.additions, content.deletions);
	}
};

const renderedLinePositionsForFileDiff = (
	fileDiff: FileDiffMetadata
): RenderedLinePositions => {
	const positions = {
		additions: new Map<number, RenderedLinePosition>(),
		deletions: new Map<number, RenderedLinePosition>(),
	};

	for (const hunk of fileDiff.hunks) {
		renderedLinePositionsForHunk(hunk, positions);
	}

	return positions;
};

const positionsForSelection = ({
	positions,
	selection,
	side,
}: {
	readonly positions: RenderedLinePositions;
	readonly selection: SelectedLineRange;
	readonly side: SelectionSide;
}) => {
	const [start, end] = ascendingRange(selection.start, selection.end);
	const positionMap =
		side === "additions" ? positions.additions : positions.deletions;

	if (
		!isSelectableLineRange({
			availableLineCount: positionMap.size,
			end,
			start,
		})
	) {
		return [];
	}

	return rangeNumbers(start, end).map((lineNumber) =>
		positionMap.get(lineNumber)
	);
};

const definedPositionsForSelection = ({
	positions,
	selection,
	side,
}: {
	readonly positions: RenderedLinePositions;
	readonly selection: SelectedLineRange;
	readonly side: SelectionSide;
}) => {
	const selectedPositions = positionsForSelection({
		positions,
		selection,
		side,
	});

	if (selectedPositions.length === 0 || !selectedPositions.every(isDefined)) {
		return;
	}

	return selectedPositions;
};

const definedLineNumbers = (lineNumbers: readonly (number | undefined)[]) => {
	if (!lineNumbers.every(isDefined)) {
		return;
	}

	return lineNumbers;
};

export const draftReviewCommentAnchorForSelection = ({
	fileDiff,
	fileKey,
	fileOrder,
	selection,
}: {
	readonly fileDiff: FileDiffMetadata;
	readonly fileKey: string;
	readonly fileOrder: number;
	readonly selection: SelectedLineRange;
}): DraftReviewCommentAnchor | undefined => {
	const side = selection.side;
	const endSide = selection.endSide ?? side;

	if (side === undefined || endSide !== side) {
		return;
	}

	const positions = definedPositionsForSelection({
		positions: renderedLinePositionsForFileDiff(fileDiff),
		selection,
		side,
	});

	if (positions === undefined) {
		return;
	}

	const position = Math.min(
		...positions.map((renderedLine) => renderedLine.renderedPosition)
	);

	if (side === "additions") {
		const [startLine, endLine] = ascendingRange(selection.start, selection.end);

		return {
			endLine,
			fileKey,
			fileOrder,
			path: fileDiff.name,
			position,
			side: "new",
			startLine,
		};
	}

	const lineKinds = new Set(positions.map((line) => line.kind));
	const [startLine, endLine] = ascendingRange(selection.start, selection.end);

	if (lineKinds.size !== 1) {
		return;
	}

	if (lineKinds.has("deletion")) {
		return {
			endLine,
			fileKey,
			fileOrder,
			path: fileDiff.prevName ?? fileDiff.name,
			position,
			side: "old-deleted",
			startLine,
		};
	}

	const additionLines = definedLineNumbers(
		positions.map((line) => line.additionLine)
	);

	if (additionLines === undefined) {
		return;
	}

	return {
		endLine: Math.max(...additionLines),
		fileKey,
		fileOrder,
		path: fileDiff.name,
		position,
		side: "new",
		startLine: Math.min(...additionLines),
	};
};
