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
	readonly position: number;
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
					position: renderedPosition + offset,
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
				position: renderedPosition + offset,
			} as const;
			positions.deletions.set(position.deletionLine, position);
		}
		for (let offset = 0; offset < content.additions; offset += 1) {
			const position = {
				additionLine: additionLine + offset,
				deletionLine: undefined,
				kind: "addition",
				position: renderedPosition + offset,
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
		...positions.map((renderedLine) => renderedLine.position)
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
