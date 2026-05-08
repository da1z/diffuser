import {
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
import { type ComponentType, useEffect, useMemo, useState } from "react";

import {
	reviewSessionEndpoint,
	reviewSessionShutdownEndpoint,
} from "./diffuser/protocol";
import type { DiffFileSnapshot, ReviewSession } from "./diffuser/workflow";
import {
	clearSubmittedDraftReviewComments,
	type DraftReviewCommentAnchor,
	type DraftReviewCommentState,
	deleteSubmittedDraftReviewComment,
	draftReviewCommentAnchorForSelection,
	draftReviewCommentCountByFileKey,
	emptyDraftReviewCommentState,
	type SubmittedDraftReviewComment,
	submitDraftReviewComment,
} from "./review-comments";
import { formatReviewSummary } from "./review-summary";
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
interface DraftReviewCommentAnnotation {
	readonly anchor?: DraftReviewCommentAnchor;
	readonly comment?: SubmittedDraftReviewComment;
	readonly kind: "form" | "comment";
}
type DraftReviewCommentLineAnnotation =
	DiffLineAnnotation<DraftReviewCommentAnnotation>;
interface FileReviewState {
	readonly collapsed: boolean;
	readonly viewed: boolean;
}
type FileReviewStates = Record<string, FileReviewState | undefined>;
export type FileDiffRendererProps = Pick<
	FileDiffProps<DraftReviewCommentAnnotation>,
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

const getFileReviewState = (states: FileReviewStates, key: string) =>
	states[key] ?? initialFileReviewState;

const renderedSplitHunkRowCount = (fileDiff: ParsedFileDiff) =>
	fileDiff.hunks.reduce((rowCount, hunk) => rowCount + hunk.splitLineCount, 0);

const shouldDefaultCollapseFileDiff = (fileDiff: ParsedFileDiff) =>
	renderedSplitHunkRowCount(fileDiff) > LARGE_RENDERED_FILE_DIFF_ROW_THRESHOLD;

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

const draftReviewCommentLineAnnotationForAnchor = (
	anchor: DraftReviewCommentAnchor,
	metadata: DraftReviewCommentAnnotation
): DraftReviewCommentLineAnnotation => ({
	lineNumber: anchor.endLine,
	metadata,
	side: anchor.side === "old-deleted" ? "deletions" : "additions",
});

const draftReviewCommentLineAnnotationsForFile = ({
	activeAnchor,
	fileKey,
	submittedComments,
}: {
	readonly activeAnchor: DraftReviewCommentAnchor | undefined;
	readonly fileKey: string;
	readonly submittedComments: readonly SubmittedDraftReviewComment[];
}): DraftReviewCommentLineAnnotation[] => [
	...submittedComments
		.filter((comment) => comment.anchor.fileKey === fileKey)
		.map((comment) =>
			draftReviewCommentLineAnnotationForAnchor(comment.anchor, {
				comment,
				kind: "comment",
			})
		),
	...(activeAnchor?.fileKey === fileKey
		? [
				draftReviewCommentLineAnnotationForAnchor(activeAnchor, {
					anchor: activeAnchor,
					kind: "form",
				}),
			]
		: []),
];

const FileDraftReviewCommentCount = ({ count }: { readonly count: number }) =>
	count > 0 ? (
		<span className="draft-review-comment-file-count">
			{count} {count === 1 ? "comment" : "comments"}
		</span>
	) : undefined;

const DraftReviewCommentForm = ({
	body,
	onCancel,
	onSubmit,
}: {
	readonly body: string;
	readonly onCancel: () => void;
	readonly onSubmit: (body: string) => void;
}) => (
	<form
		className="draft-review-comment-form"
		onSubmit={(event) => {
			event.preventDefault();
			const textarea = event.currentTarget.elements.namedItem("body");
			onSubmit(
				textarea !== null && "value" in textarea ? String(textarea.value) : ""
			);
		}}
	>
		<textarea
			aria-label="Draft review comment"
			defaultValue={body}
			name="body"
			placeholder="Add a draft review comment..."
		/>
		<div className="draft-review-comment-actions">
			<button aria-label="Submit draft review comment" type="submit">
				Comment
			</button>
			<button onClick={onCancel} type="button">
				Cancel
			</button>
		</div>
	</form>
);

const SubmittedDraftReviewCommentView = ({
	comment,
	onDelete,
}: {
	readonly comment: SubmittedDraftReviewComment;
	readonly onDelete: (commentId: string) => void;
}) => (
	<div className="draft-review-comment">
		<p>{comment.body}</p>
		<button
			aria-label="Delete draft review comment"
			onClick={() => {
				onDelete(comment.id);
			}}
			type="button"
		>
			Delete
		</button>
	</div>
);

const ReviewCommentToolbar = ({
	commentCount,
	copyError,
	onClear,
	onCopy,
}: {
	readonly commentCount: number;
	readonly copyError: string | undefined;
	readonly onClear: () => void;
	readonly onCopy: () => void;
}) => (
	<aside aria-label="Review Comment Toolbar" className="review-comment-toolbar">
		<span>
			{commentCount} draft {commentCount === 1 ? "comment" : "comments"}
		</span>
		<button aria-label="Copy review" onClick={onCopy} type="button">
			Copy review
		</button>
		<button onClick={onClear} type="button">
			Clear
		</button>
		{copyError === undefined ? undefined : <p>{copyError}</p>}
	</aside>
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
	const [draftReviewCommentState, setDraftReviewCommentState] =
		useState<DraftReviewCommentState>(emptyDraftReviewCommentState);
	const [activeDraftReviewCommentAnchor, setActiveDraftReviewCommentAnchor] =
		useState<DraftReviewCommentAnchor | undefined>();
	const [
		activeDraftReviewCommentSelection,
		setActiveDraftReviewCommentSelection,
	] = useState<SelectedLineRange | null>(null);
	const [activeDraftReviewCommentBody, setActiveDraftReviewCommentBody] =
		useState("");
	const [copyError, setCopyError] = useState<string | undefined>();
	useEffect(() => {
		setFileReviewStates(initialFileReviewStates);
		setDraftReviewCommentState(emptyDraftReviewCommentState());
		setActiveDraftReviewCommentAnchor(undefined);
		setActiveDraftReviewCommentSelection(null);
		setActiveDraftReviewCommentBody("");
		setCopyError(undefined);
	}, [initialFileReviewStates]);
	const submittedComments = draftReviewCommentState.submittedComments;
	const commentCountsByFileKey = draftReviewCommentCountByFileKey(
		draftReviewCommentState
	);
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
	const cancelDraftReviewCommentForm = () => {
		setActiveDraftReviewCommentAnchor(undefined);
		setActiveDraftReviewCommentSelection(null);
		setActiveDraftReviewCommentBody("");
	};
	const submitActiveDraftReviewComment = (body: string) => {
		if (activeDraftReviewCommentAnchor === undefined) {
			return;
		}

		setDraftReviewCommentState((state) =>
			submitDraftReviewComment(state, {
				anchor: activeDraftReviewCommentAnchor,
				body,
			})
		);
		cancelDraftReviewCommentForm();
	};
	const deleteDraftReviewComment = (commentId: string) => {
		setDraftReviewCommentState((state) =>
			deleteSubmittedDraftReviewComment(state, commentId)
		);
	};
	const clearDraftReviewComments = () => {
		setDraftReviewCommentState(clearSubmittedDraftReviewComments);
		setCopyError(undefined);
	};
	const copyReview = () => {
		navigator.clipboard
			.writeText(formatReviewSummary(submittedComments))
			.then(() => {
				clearDraftReviewComments();
			})
			.catch(() => {
				setCopyError("Could not copy review.");
			});
	};
	const confirmClearDraftReviewComments = () => {
		// biome-ignore lint/suspicious/noAlert: The PRD requires the browser confirmation dialog for clearing draft comments.
		if (window.confirm("Clear all draft review comments?")) {
			clearDraftReviewComments();
		}
	};
	const renderDraftReviewCommentAnnotation = (
		annotation: DraftReviewCommentLineAnnotation
	) => {
		const metadata = annotation.metadata;

		if (metadata.kind === "form") {
			return (
				<DraftReviewCommentForm
					body={activeDraftReviewCommentBody}
					onCancel={cancelDraftReviewCommentForm}
					onSubmit={submitActiveDraftReviewComment}
				/>
			);
		}

		if (metadata.comment === undefined) {
			return;
		}

		return (
			<SubmittedDraftReviewCommentView
				comment={metadata.comment}
				onDelete={deleteDraftReviewComment}
			/>
		);
	};

	return (
		<>
			{fileDiffs.map((fileDiff, index) => {
				const key = fileDiffKey(fileDiff, index);
				const fileReviewState = getFileReviewState(fileReviewStates, key);
				const label = fileReviewLabel(fileDiff);
				const fileCommentCount = commentCountsByFileKey[key] ?? 0;

				return (
					<DiffRenderer
						fileDiff={fileDiff}
						key={key}
						lineAnnotations={draftReviewCommentLineAnnotationsForFile({
							activeAnchor: activeDraftReviewCommentAnchor,
							fileKey: key,
							submittedComments,
						})}
						options={{
							...continuousDiffViewOptions,
							collapsed: fileReviewState.collapsed,
							enableLineSelection: true,
							onLineSelected: (selection) => {
								if (selection === null) {
									cancelDraftReviewCommentForm();
									return;
								}
								const anchor = draftReviewCommentAnchorForSelection({
									fileDiff,
									fileKey: key,
									fileOrder: index,
									selection,
								});

								if (anchor === undefined) {
									cancelDraftReviewCommentForm();
									return;
								}

								setActiveDraftReviewCommentAnchor(anchor);
								setActiveDraftReviewCommentSelection(selection);
								setActiveDraftReviewCommentBody("");
								setCopyError(undefined);
							},
						}}
						renderAnnotation={renderDraftReviewCommentAnnotation}
						renderHeaderMetadata={() => (
							<>
								<FileDraftReviewCommentCount count={fileCommentCount} />
								<ViewedFileControl
									label={label}
									onViewedChange={(viewed) => {
										markViewed(key, viewed);
									}}
									viewed={fileReviewState.viewed}
								/>
							</>
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
							activeDraftReviewCommentAnchor?.fileKey === key
								? activeDraftReviewCommentSelection
								: null
						}
					/>
				);
			})}
			{submittedComments.length > 0 ? (
				<ReviewCommentToolbar
					commentCount={submittedComments.length}
					copyError={copyError}
					onClear={confirmClearDraftReviewComments}
					onCopy={copyReview}
				/>
			) : undefined}
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
