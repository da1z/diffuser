import {
	type AnnotationSide,
	type DiffLineAnnotation,
	type FileDiffOptions,
	parsePatchFiles,
	processFile,
	type SelectedLineRange,
} from "@pierre/diffs";
import {
	FileDiff,
	type FileDiffMetadata,
	type FileDiffProps,
} from "@pierre/diffs/react";
import {
	type ComponentType,
	type FormEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import {
	reviewSessionEndpoint,
	reviewSessionShutdownEndpoint,
} from "./diffuser/protocol";
import type { DiffFileSnapshot, ReviewSession } from "./diffuser/workflow";
import "./index.css";

export interface AppProps {
	readonly initialSession?: ReviewSession;
}

type FetchReviewSession = (
	input: Parameters<typeof fetch>[0],
	init?: Parameters<typeof fetch>[1]
) => ReturnType<typeof fetch>;

type ParsedFileDiff = FileDiffMetadata;
type ReviewSessionContext = ReviewSession["context"];
type DraftReviewAnchorSide = "new" | "old/deleted";
interface DraftReviewAnchor {
	readonly endLine: number;
	readonly path: string;
	readonly side: DraftReviewAnchorSide;
	readonly startLine: number;
}
interface OpenDraftReviewComment {
	readonly anchor: DraftReviewAnchor;
	readonly annotationLine: number;
	readonly annotationSide: AnnotationSide;
	readonly fileKey: string;
	readonly selectedLines: SelectedLineRange;
}
interface SubmittedDraftReviewComment {
	readonly anchor: DraftReviewAnchor;
	readonly annotationLine: number;
	readonly annotationSide: AnnotationSide;
	readonly body: string;
	readonly fileKey: string;
	readonly id: number;
}
type DraftReviewAnnotationMetadata =
	| {
			readonly anchor: DraftReviewAnchor;
			readonly kind: "form";
	  }
	| {
			readonly anchor: DraftReviewAnchor;
			readonly comment: SubmittedDraftReviewComment;
			readonly kind: "comment";
	  };
interface FileReviewState {
	readonly collapsed: boolean;
	readonly viewed: boolean;
}
type FileReviewStates = Record<string, FileReviewState | undefined>;
export type FileDiffRendererProps = Pick<
	FileDiffProps<DraftReviewAnnotationMetadata>,
	| "fileDiff"
	| "lineAnnotations"
	| "options"
	| "renderAnnotation"
	| "renderHeaderMetadata"
	| "renderHeaderPrefix"
	| "selectedLines"
>;

export const continuousDiffViewOptions = {
	diffStyle: "split",
	hunkSeparators: "line-info-basic",
} as const satisfies FileDiffOptions<undefined>;
export const LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD = 200;
const initialFileReviewState: FileReviewState = {
	viewed: false,
	collapsed: false,
};
const emptyDiffFileSnapshots: readonly DiffFileSnapshot[] = [];

const fileDiffKey = (fileDiff: ParsedFileDiff, index: number) =>
	[
		index,
		fileDiff.prevName,
		fileDiff.name,
		fileDiff.type,
		...fileDiff.hunks.map((hunk) => hunk.hunkSpecs),
	].join("\0");

const fileReviewLabel = (fileDiff: ParsedFileDiff) =>
	fileDiff.name ?? fileDiff.prevName ?? "file";

const draftReviewAnchorPath = (
	fileDiff: ParsedFileDiff,
	side: DraftReviewAnchorSide
) =>
	side === "old/deleted"
		? (fileDiff.prevName ?? fileDiff.name ?? "file")
		: (fileDiff.name ?? fileDiff.prevName ?? "file");

const getFileReviewState = (states: FileReviewStates, key: string) =>
	states[key] ?? initialFileReviewState;

const renderedSplitHunkRowCount = (fileDiff: ParsedFileDiff) =>
	fileDiff.hunks.reduce((rowCount, hunk) => rowCount + hunk.splitLineCount, 0);

const shouldDefaultCollapseFileDiff = (fileDiff: ParsedFileDiff) =>
	renderedSplitHunkRowCount(fileDiff) > LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD;

const draftReviewLocation = (anchor: DraftReviewAnchor) => {
	const linePart =
		anchor.startLine === anchor.endLine
			? String(anchor.startLine)
			: `${anchor.startLine}-${anchor.endLine}`;

	return `${anchor.path}:${linePart} [${anchor.side}]`;
};

const lineAnchorFor = ({
	fileDiff,
	lineNumber,
	side,
}: {
	readonly fileDiff: ParsedFileDiff;
	readonly lineNumber: number;
	readonly side: AnnotationSide;
}):
	| { readonly lineNumber: number; readonly side: DraftReviewAnchorSide }
	| undefined => {
	if (side === "additions") {
		return { lineNumber, side: "new" };
	}

	const lineIndex = lineNumber - 1;
	for (const hunk of fileDiff.hunks) {
		for (const content of hunk.hunkContent) {
			if (content.type === "context") {
				const deletionStart = content.deletionLineIndex;
				const deletionEnd = deletionStart + content.lines - 1;
				if (lineIndex >= deletionStart && lineIndex <= deletionEnd) {
					return {
						lineNumber:
							content.additionLineIndex + (lineIndex - deletionStart) + 1,
						side: "new",
					};
				}
				continue;
			}

			const deletionStart = content.deletionLineIndex;
			const deletionEnd = deletionStart + content.deletions - 1;
			if (lineIndex >= deletionStart && lineIndex <= deletionEnd) {
				return { lineNumber, side: "old/deleted" };
			}
		}
	}

	return;
};

const draftReviewAnchorForSelection = ({
	fileDiff,
	range,
}: {
	readonly fileDiff: ParsedFileDiff;
	readonly range: SelectedLineRange;
}): DraftReviewAnchor | undefined => {
	const side = range.side ?? "additions";
	const endSide = range.endSide ?? side;
	if (side !== endSide) {
		return;
	}

	const selectedStart = Math.min(range.start, range.end);
	const selectedEnd = Math.max(range.start, range.end);
	const lines = Array.from(
		{ length: selectedEnd - selectedStart + 1 },
		(_, index) => selectedStart + index
	);
	const anchors = lines
		.map((lineNumber) => lineAnchorFor({ fileDiff, lineNumber, side }))
		.filter(
			(anchor): anchor is NonNullable<typeof anchor> => anchor !== undefined
		);
	const anchorSide = anchors[0]?.side;
	if (
		anchors.length !== lines.length ||
		anchorSide === undefined ||
		anchors.some((anchor) => anchor.side !== anchorSide)
	) {
		return;
	}
	const anchorLines = anchors.map((anchor) => anchor.lineNumber);

	return {
		path: draftReviewAnchorPath(fileDiff, anchorSide),
		side: anchorSide,
		startLine: Math.min(...anchorLines),
		endLine: Math.max(...anchorLines),
	};
};

const draftReviewAnnotationFor = (
	comment: SubmittedDraftReviewComment
): DiffLineAnnotation<DraftReviewAnnotationMetadata> => ({
	lineNumber: comment.annotationLine,
	metadata: {
		anchor: comment.anchor,
		comment,
		kind: "comment",
	},
	side: comment.annotationSide,
});

const openDraftReviewAnnotationFor = (
	comment: OpenDraftReviewComment
): DiffLineAnnotation<DraftReviewAnnotationMetadata> => ({
	lineNumber: comment.annotationLine,
	metadata: {
		anchor: comment.anchor,
		kind: "form",
	},
	side: comment.annotationSide,
});

const initialFileReviewStateFor = (
	fileDiff: ParsedFileDiff
): FileReviewState => ({
	viewed: false,
	collapsed: shouldDefaultCollapseFileDiff(fileDiff),
});

const initialFileReviewStatesFor = (fileDiffs: readonly ParsedFileDiff[]) =>
	Object.fromEntries(
		fileDiffs.map((fileDiff, index) => [
			fileDiffKey(fileDiff, index),
			initialFileReviewStateFor(fileDiff),
		])
	) satisfies FileReviewStates;

const splitPatchIntoFileEntries = (patch: string) => {
	const matches = Array.from(patch.matchAll(/^diff --git .+$/gm));

	return matches.map((match, index) => {
		const start = match.index ?? 0;
		const nextStart = matches[index + 1]?.index ?? patch.length;

		return patch.slice(start, nextStart);
	});
};

const enrichFileDiffWithSnapshot = ({
	fileDiff,
	patchFileEntry,
	snapshot,
}: {
	readonly fileDiff: ParsedFileDiff;
	readonly patchFileEntry: string | undefined;
	readonly snapshot: DiffFileSnapshot | undefined;
}) => {
	if (snapshot?.status !== "available" || patchFileEntry === undefined) {
		return fileDiff;
	}

	return (
		processFile(patchFileEntry, {
			oldFile: snapshot.oldFile,
			newFile: snapshot.newFile,
		}) ?? fileDiff
	);
};

const parsedFileDiffsFor = (
	patch: string,
	diffFileSnapshots: readonly DiffFileSnapshot[]
) => {
	const patchFileEntries = splitPatchIntoFileEntries(patch);

	return parsePatchFiles(patch)
		.flatMap((parsedPatch) => parsedPatch.files)
		.map((fileDiff, index) =>
			enrichFileDiffWithSnapshot({
				fileDiff,
				patchFileEntry: patchFileEntries[index],
				snapshot: diffFileSnapshots[index],
			})
		);
};

interface FileCollapseToggleProps {
	readonly collapsed: boolean;
	readonly label: string;
	readonly onToggle: () => void;
}

const FileCollapseToggle = ({
	collapsed,
	label,
	onToggle,
}: FileCollapseToggleProps) => (
	<button
		aria-expanded={!collapsed}
		aria-label={`Toggle ${label} collapsed`}
		className="file-collapse-toggle"
		onClick={onToggle}
		type="button"
	>
		{collapsed ? "+" : "-"}
	</button>
);

interface ViewedFileControlProps {
	readonly label: string;
	readonly onViewedChange: (viewed: boolean) => void;
	readonly viewed: boolean;
}

const viewedFileControlBaseClassName =
	"viewed-file-control flex cursor-pointer items-center gap-1.5 rounded-md border py-1 pr-2 pl-1 text-xs transition";
const viewedFileControlViewedClassName =
	"border-blue-400/50 bg-blue-500/25 text-blue-200";
const viewedFileControlUnviewedClassName =
	"border-white/20 bg-transparent text-white/70 hover:border-white/35 hover:bg-white/5 hover:text-white/85";
const viewedFileControlIconProps = {
	fill: "none",
	height: "16",
	viewBox: "0 0 16 16",
	width: "16",
	xmlns: "http://www.w3.org/2000/svg",
} as const;

const viewedFileControlClassName = (viewed: boolean) =>
	[
		viewedFileControlBaseClassName,
		viewed
			? viewedFileControlViewedClassName
			: viewedFileControlUnviewedClassName,
	].join(" ");

const ViewedFileControlIcon = ({ viewed }: { readonly viewed: boolean }) =>
	viewed ? (
		<svg
			aria-hidden="true"
			className="text-blue-400"
			{...viewedFileControlIconProps}
		>
			<rect fill="currentColor" height="12" rx="3" width="12" x="2" y="2" />
			<path
				d="m5.5 8 1.6 1.6 3.4-3.4"
				stroke="white"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
			/>
		</svg>
	) : (
		<svg
			aria-hidden="true"
			className="text-white/50"
			{...viewedFileControlIconProps}
		>
			<rect
				height="10"
				rx="3"
				stroke="currentColor"
				strokeWidth="1.5"
				width="10"
				x="3"
				y="3"
			/>
		</svg>
	);

const ViewedFileControl = ({
	label,
	onViewedChange,
	viewed,
}: ViewedFileControlProps) => (
	<button
		aria-label={`Mark ${label} viewed`}
		aria-pressed={viewed}
		className={viewedFileControlClassName(viewed)}
		onClick={() => {
			onViewedChange(!viewed);
		}}
		type="button"
	>
		<ViewedFileControlIcon viewed={viewed} />
		Viewed
	</button>
);

interface DraftReviewCommentFormProps {
	readonly anchor: DraftReviewAnchor;
	readonly onCancel: () => void;
	readonly onSubmit: (body: string) => void;
}

const DraftReviewCommentForm = ({
	anchor,
	onCancel,
	onSubmit,
}: DraftReviewCommentFormProps) => {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const submit = (event: FormEvent) => {
		event.preventDefault();
		onSubmit(textareaRef.current?.value ?? "");
	};

	return (
		<form className="draft-review-comment-form" onSubmit={submit}>
			<p className="draft-review-comment-location">
				{draftReviewLocation(anchor)}
			</p>
			<textarea
				aria-label="Draft review comment"
				className="draft-review-comment-textarea"
				placeholder="Leave a comment"
				ref={textareaRef}
			/>
			<div className="draft-review-comment-actions">
				<button aria-label="Submit draft review comment" type="submit">
					Comment
				</button>
				<button
					aria-label="Cancel draft review comment"
					onClick={onCancel}
					type="button"
				>
					Cancel
				</button>
			</div>
		</form>
	);
};

interface SubmittedDraftReviewCommentViewProps {
	readonly comment: SubmittedDraftReviewComment;
	readonly onDiscard: () => void;
}

const SubmittedDraftReviewCommentView = ({
	comment,
	onDiscard,
}: SubmittedDraftReviewCommentViewProps) => (
	<article className="draft-review-comment" data-draft-comment="">
		<div className="draft-review-comment-location">
			{draftReviewLocation(comment.anchor)}
		</div>
		<p>{comment.body}</p>
		<button
			aria-label="Discard draft review comment"
			onClick={onDiscard}
			type="button"
		>
			Delete
		</button>
	</article>
);

export const loadReviewSession = async (
	fetchSession: FetchReviewSession = fetch
): Promise<ReviewSession> => {
	const response = await fetchSession(reviewSessionEndpoint);

	if (!response.ok) {
		throw new Error("Review Session could not be loaded.");
	}

	return response.json() as Promise<ReviewSession>;
};

const notifyReviewSessionPageHidden = () => {
	if (navigator.sendBeacon?.(reviewSessionShutdownEndpoint)) {
		return;
	}

	fetch(reviewSessionShutdownEndpoint, {
		keepalive: true,
		method: "POST",
	}).catch(() => {
		// Page unload signals are best-effort; there is no useful recovery path.
	});
};

export const ContinuousPatchDiff = ({
	diffFileSnapshots = emptyDiffFileSnapshots,
	patch,
	DiffRenderer = FileDiff,
}: {
	readonly diffFileSnapshots?: readonly DiffFileSnapshot[];
	readonly patch: string;
	readonly DiffRenderer?: ComponentType<FileDiffRendererProps>;
}) => {
	const fileDiffs = useMemo(
		() => parsedFileDiffsFor(patch, diffFileSnapshots),
		[patch, diffFileSnapshots]
	);
	const initialFileReviewStates = useMemo(
		() => initialFileReviewStatesFor(fileDiffs),
		[fileDiffs]
	);
	const [fileReviewStates, setFileReviewStates] = useState<FileReviewStates>(
		initialFileReviewStates
	);
	const [openDraftReviewComment, setOpenDraftReviewComment] = useState<
		OpenDraftReviewComment | undefined
	>();
	const [submittedDraftReviewComments, setSubmittedDraftReviewComments] =
		useState<readonly SubmittedDraftReviewComment[]>([]);
	const [nextDraftReviewCommentId, setNextDraftReviewCommentId] = useState(1);
	useEffect(() => {
		setFileReviewStates(initialFileReviewStates);
	}, [initialFileReviewStates]);
	const updateFileReviewState = (
		key: string,
		update: (current: FileReviewState) => FileReviewState
	) => {
		setFileReviewStates((states) => ({
			...states,
			[key]: update(getFileReviewState(states, key)),
		}));
	};
	const markViewed = (key: string, viewed: boolean) => {
		updateFileReviewState(key, (current) => ({
			viewed,
			collapsed: viewed ? true : current.collapsed,
		}));
	};
	const toggleCollapsed = (key: string) => {
		updateFileReviewState(key, (current) => ({
			...current,
			collapsed: !current.collapsed,
		}));
	};
	const openDraftReviewCommentForSelection = (
		key: string,
		fileDiff: ParsedFileDiff,
		range: SelectedLineRange | null
	) => {
		if (range === null) {
			setOpenDraftReviewComment(undefined);
			return;
		}

		const anchor = draftReviewAnchorForSelection({ fileDiff, range });
		if (anchor === undefined) {
			setOpenDraftReviewComment(undefined);
			return;
		}

		const annotationSide: AnnotationSide =
			anchor.side === "old/deleted" ? "deletions" : "additions";
		const selectedLines =
			range.side === undefined
				? {
						end: Math.max(range.start, range.end),
						start: Math.min(range.start, range.end),
					}
				: {
						end: Math.max(range.start, range.end),
						side: range.side,
						start: Math.min(range.start, range.end),
					};
		setOpenDraftReviewComment({
			anchor,
			annotationLine: anchor.endLine,
			annotationSide,
			fileKey: key,
			selectedLines,
		});
	};
	const submitDraftReviewComment = (
		comment: OpenDraftReviewComment,
		body: string
	) => {
		const trimmedBody = body.trim();
		setOpenDraftReviewComment(undefined);
		if (trimmedBody.length === 0) {
			return;
		}

		setSubmittedDraftReviewComments((comments) => [
			...comments,
			{
				anchor: comment.anchor,
				annotationLine: comment.annotationLine,
				annotationSide: comment.annotationSide,
				body: trimmedBody,
				fileKey: comment.fileKey,
				id: nextDraftReviewCommentId,
			},
		]);
		setNextDraftReviewCommentId((id) => id + 1);
	};
	const discardDraftReviewComment = (commentId: number) => {
		setSubmittedDraftReviewComments((comments) =>
			comments.filter((comment) => comment.id !== commentId)
		);
	};

	return (
		<>
			{fileDiffs.map((fileDiff, index) => {
				const key = fileDiffKey(fileDiff, index);
				const fileReviewState = getFileReviewState(fileReviewStates, key);
				const label = fileReviewLabel(fileDiff);
				const submittedAnnotations = submittedDraftReviewComments
					.filter((comment) => comment.fileKey === key)
					.map(draftReviewAnnotationFor);
				const lineAnnotations =
					openDraftReviewComment?.fileKey === key
						? [
								...submittedAnnotations,
								openDraftReviewAnnotationFor(openDraftReviewComment),
							]
						: submittedAnnotations;

				return (
					<DiffRenderer
						fileDiff={fileDiff}
						key={key}
						lineAnnotations={lineAnnotations}
						options={{
							...continuousDiffViewOptions,
							collapsed: fileReviewState.collapsed,
							enableLineSelection: true,
							onLineSelectionEnd: (range) => {
								openDraftReviewCommentForSelection(key, fileDiff, range);
							},
						}}
						renderAnnotation={(annotation) => {
							const metadata = annotation.metadata;
							switch (metadata.kind) {
								case "form":
									if (openDraftReviewComment?.fileKey !== key) {
										return null;
									}

									return (
										<DraftReviewCommentForm
											anchor={metadata.anchor}
											onCancel={() => {
												setOpenDraftReviewComment(undefined);
											}}
											onSubmit={(body) => {
												submitDraftReviewComment(openDraftReviewComment, body);
											}}
										/>
									);
								case "comment":
									return (
										<SubmittedDraftReviewCommentView
											comment={metadata.comment}
											onDiscard={() => {
												discardDraftReviewComment(metadata.comment.id);
											}}
										/>
									);
								default:
									return null;
							}
						}}
						renderHeaderMetadata={() => (
							<ViewedFileControl
								label={label}
								onViewedChange={(viewed) => {
									markViewed(key, viewed);
								}}
								viewed={fileReviewState.viewed}
							/>
						)}
						renderHeaderPrefix={() => (
							<FileCollapseToggle
								collapsed={fileReviewState.collapsed}
								label={label}
								onToggle={() => {
									toggleCollapsed(key);
								}}
							/>
						)}
						selectedLines={
							openDraftReviewComment?.fileKey === key
								? openDraftReviewComment.selectedLines
								: null
						}
					/>
				);
			})}
		</>
	);
};

const ReviewHeader = ({
	context,
}: {
	readonly context: ReviewSessionContext;
}) => {
	const commit = context.commit;

	return (
		<header className="review-header">
			<p className="eyebrow">Diffuser Review</p>
			<h1>{context.command}</h1>
			<p>
				{context.repository.workingDirectory} in {context.repository.root}
			</p>
			{commit === undefined ? undefined : (
				<p>
					{commit.shortOid} by {commit.authorName} &lt;{commit.authorEmail}&gt;{" "}
					on {commit.authoredAt}: {commit.subject}
				</p>
			)}
			<p>Captured {context.capturedAt}</p>
		</header>
	);
};

const ReviewSessionView = ({
	session,
}: {
	readonly session: ReviewSession;
}) => (
	<main className="app">
		<ReviewHeader context={session.context} />
		<section aria-label="Patch">
			<ContinuousPatchDiff
				diffFileSnapshots={session.diffFileSnapshots}
				patch={session.patch}
			/>
		</section>
	</main>
);

export const App = ({ initialSession }: AppProps) => {
	const [session, setSession] = useState<ReviewSession | undefined>(
		initialSession
	);
	const [error, setError] = useState<string | undefined>();

	useEffect(() => {
		if (session !== undefined) {
			return;
		}

		loadReviewSession()
			.then(setSession)
			.catch((unknownError: unknown) => {
				setError(
					unknownError instanceof Error
						? unknownError.message
						: "Review Session could not be loaded."
				);
			});
	}, [session]);

	useEffect(() => {
		window.addEventListener("pagehide", notifyReviewSessionPageHidden);

		return () => {
			window.removeEventListener("pagehide", notifyReviewSessionPageHidden);
		};
	}, []);

	if (error !== undefined) {
		return <main className="app">{error}</main>;
	}

	if (session === undefined) {
		return <main className="app">Loading Review Session...</main>;
	}

	return <ReviewSessionView session={session} />;
};

export default App;
