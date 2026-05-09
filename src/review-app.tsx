import {
	type DiffLineAnnotation,
	type FileDiffOptions,
	parsePatchFiles,
	type SelectedLineRange,
} from "@pierre/diffs";
import {
	FileDiff,
	type FileDiffMetadata,
	type FileDiffProps,
} from "@pierre/diffs/react";
import { IconCheckboxFill, IconChevronSm, IconSquircleLg } from "@pierre/icons";
import { type ComponentType, useEffect, useMemo, useState } from "react";

import { formatCommentAnchorLocation } from "./comment-anchor-location";
import {
	reviewSessionEndpoint,
	reviewSessionShutdownEndpoint,
} from "./diffuser/protocol";
import { reviewSessionFromSessionEndpointPayload } from "./diffuser/session-endpoint-payload";
import type { ReviewSession } from "./diffuser/workflow";
import {
	confirmClearDraftReviewComments as confirmClearDraftReviewCommentsPolicy,
	copyDraftReviewCommentsToClipboard,
	type DraftReviewCommentCopyClearState,
} from "./draft-review-comment-copy-clear-policy";
import {
	type FileReviewStates,
	fileDiffKey,
	getFileReviewState,
	initialFileReviewStatesFor,
	markFileViewed,
	toggleFileCollapsed,
} from "./file-review-state";
import {
	type DraftReviewCommentAnchor,
	type DraftReviewCommentState,
	deleteSubmittedDraftReviewComment,
	draftReviewCommentAnchorForSelection,
	draftReviewCommentCountByFileKey,
	emptyDraftReviewCommentState,
	type SubmittedDraftReviewComment,
	submitDraftReviewComment,
} from "./review-comments";
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

const fileReviewLabel = (fileDiff: ParsedFileDiff) =>
	fileDiff.name ?? fileDiff.prevName ?? "file";

const draftReviewCommentFormLinePrefix = (anchor: DraftReviewCommentAnchor) =>
	anchor.side === "old-deleted" ? "L" : "R";

const draftReviewCommentFormTitle = (anchor: DraftReviewCommentAnchor) => {
	const linePrefix = draftReviewCommentFormLinePrefix(anchor);

	if (anchor.startLine === anchor.endLine) {
		return `Add a comment on line ${linePrefix}${anchor.startLine}`;
	}

	return `Add a comment on lines ${linePrefix}${anchor.startLine} to ${linePrefix}${anchor.endLine}`;
};

const draftReviewCommentBodyFromForm = (
	form: HTMLFormElement | null,
	fallbackTextarea?: HTMLTextAreaElement
) => {
	const textarea = form?.elements.namedItem("body") ?? fallbackTextarea;

	if (textarea === null || textarea === undefined || !("value" in textarea)) {
		return "";
	}

	return String(textarea.value);
};

const isDraftReviewCommentSubmitShortcut = (
	event: Pick<KeyboardEvent, "key" | "metaKey">
) => event.key === "Enter" && event.metaKey;

const parsedFileDiffsFor = (patch: string) =>
	parsePatchFiles(patch).flatMap((parsedPatch) => parsedPatch.files);

interface FileCollapseToggleProps {
	readonly collapsed: boolean;
	readonly onToggle: () => void;
}

const FileCollapseToggle = ({
	collapsed,
	onToggle,
}: FileCollapseToggleProps) => (
	<button
		aria-label={collapsed ? "Expand file" : "Collapse file"}
		aria-pressed={collapsed}
		className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-white/65 transition hover:bg-white/10 hover:text-white"
		onClick={onToggle}
		style={{ marginLeft: -5 }}
		type="button"
	>
		<IconChevronSm
			className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
		/>
	</button>
);

interface ViewedFileControlProps {
	readonly label: string;
	readonly onViewedChange: (viewed: boolean) => void;
	readonly viewed: boolean;
}

interface ViewedButtonProps {
	readonly "aria-label"?: string;
	readonly className?: string;
	readonly isViewed: boolean;
	readonly onClick: () => void;
}

const ViewedButton = ({
	"aria-label": ariaLabel,
	className,
	isViewed,
	onClick,
}: ViewedButtonProps) => (
	<button
		aria-label={ariaLabel}
		aria-pressed={isViewed}
		className={`flex cursor-pointer items-center gap-1.5 rounded-md border py-1 pr-2 pl-1 text-xs transition ${
			isViewed
				? "border-blue-400/50 bg-blue-500/25 text-blue-200"
				: "border-white/20 bg-transparent text-white/70 hover:border-white/35 hover:bg-white/5 hover:text-white/85"
		} ${className ?? ""}`}
		onClick={onClick}
		type="button"
	>
		{isViewed ? (
			<IconCheckboxFill className="text-blue-400" />
		) : (
			<IconSquircleLg className="text-white/50" />
		)}
		Viewed
	</button>
);

const ViewedFileControl = ({
	label,
	onViewedChange,
	viewed,
}: ViewedFileControlProps) => (
	<ViewedButton
		aria-label={`Mark ${label} viewed`}
		isViewed={viewed}
		onClick={() => {
			onViewedChange(!viewed);
		}}
	/>
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
	) : null;

interface FileHeaderMetadataProps {
	readonly commentCount: number;
	readonly label: string;
	readonly onViewedChange: (viewed: boolean) => void;
	readonly viewed: boolean;
}

const FileHeaderMetadata = ({
	commentCount,
	label,
	onViewedChange,
	viewed,
}: FileHeaderMetadataProps) => (
	<div className="file-header-metadata">
		<FileDraftReviewCommentCount count={commentCount} />
		<ViewedFileControl
			label={label}
			onViewedChange={onViewedChange}
			viewed={viewed}
		/>
	</div>
);

const DraftReviewCommentForm = ({
	anchor,
	onCancel,
	onSubmit,
}: {
	readonly anchor: DraftReviewCommentAnchor;
	readonly onCancel: () => void;
	readonly onSubmit: (body: string) => void;
}) => {
	const submitDraftReviewCommentForm = (
		form: HTMLFormElement | null,
		fallbackTextarea?: HTMLTextAreaElement
	) => {
		onSubmit(draftReviewCommentBodyFromForm(form, fallbackTextarea));
	};

	return (
		<form
			className="draft-review-comment-form"
			onSubmit={(event) => {
				event.preventDefault();
				submitDraftReviewCommentForm(event.currentTarget);
			}}
		>
			<h3 className="draft-review-comment-title">
				{draftReviewCommentFormTitle(anchor)}
			</h3>
			<textarea
				aria-label="Draft review comment"
				name="body"
				onKeyDownCapture={(event) => {
					if (isDraftReviewCommentSubmitShortcut(event)) {
						event.preventDefault();
						submitDraftReviewCommentForm(
							event.currentTarget.form,
							event.currentTarget
						);
					}
				}}
				placeholder="Add a draft review comment..."
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

const SubmittedDraftReviewCommentView = ({
	comment,
	onDelete,
}: {
	readonly comment: SubmittedDraftReviewComment;
	readonly onDelete: (commentId: string) => void;
}) => (
	<article className="draft-review-comment" data-draft-comment="">
		<div className="draft-review-comment-location">
			{formatCommentAnchorLocation(comment.anchor)}
		</div>
		<p>{comment.body}</p>
		<button
			aria-label="Discard draft review comment"
			onClick={() => {
				onDelete(comment.id);
			}}
			type="button"
		>
			Delete
		</button>
	</article>
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
		<button
			aria-label="Clear draft review comments"
			onClick={onClear}
			type="button"
		>
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

	return reviewSessionFromSessionEndpointPayload(await response.json());
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
	patch,
	DiffRenderer = FileDiff,
}: {
	readonly patch: string;
	readonly DiffRenderer?: ComponentType<FileDiffRendererProps>;
}) => {
	const fileDiffs = useMemo(() => parsedFileDiffsFor(patch), [patch]);
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
	const [copyError, setCopyError] = useState<string | undefined>();
	const draftReviewCommentCopyClearState = {
		copyError,
		draftReviewCommentState,
	} satisfies DraftReviewCommentCopyClearState;
	useEffect(() => {
		setFileReviewStates(initialFileReviewStates);
		setDraftReviewCommentState(emptyDraftReviewCommentState());
		setActiveDraftReviewCommentAnchor(undefined);
		setActiveDraftReviewCommentSelection(null);
		setCopyError(undefined);
	}, [initialFileReviewStates]);
	const submittedComments = draftReviewCommentState.submittedComments;
	const commentCountsByFileKey = draftReviewCommentCountByFileKey(
		draftReviewCommentState
	);
	const markViewed = (
		fileDiff: ParsedFileDiff,
		index: number,
		viewed: boolean
	) => {
		setFileReviewStates((states) =>
			markFileViewed(states, fileDiff, index, viewed)
		);
	};
	const toggleCollapsed = (fileDiff: ParsedFileDiff, index: number) => {
		setFileReviewStates((states) =>
			toggleFileCollapsed(states, fileDiff, index)
		);
	};
	const cancelDraftReviewCommentForm = () => {
		setActiveDraftReviewCommentAnchor(undefined);
		setActiveDraftReviewCommentSelection(null);
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
	const applyDraftReviewCommentCopyClearState = (
		state: DraftReviewCommentCopyClearState
	) => {
		setDraftReviewCommentState(state.draftReviewCommentState);
		setCopyError(state.copyError);
	};
	const copyReview = () => {
		copyDraftReviewCommentsToClipboard(
			draftReviewCommentCopyClearState,
			navigator.clipboard
		).then(applyDraftReviewCommentCopyClearState);
	};
	const confirmClearDraftReviewComments = () => {
		applyDraftReviewCommentCopyClearState(
			confirmClearDraftReviewCommentsPolicy(
				draftReviewCommentCopyClearState,
				(message) => {
					// biome-ignore lint/suspicious/noAlert: The PRD requires the browser confirmation dialog for clearing draft comments.
					return window.confirm(message);
				}
			)
		);
	};
	const renderDraftReviewCommentAnnotation = (
		annotation: DraftReviewCommentLineAnnotation
	) => {
		const metadata = annotation.metadata;

		if (metadata.kind === "form") {
			if (metadata.anchor === undefined) {
				return;
			}

			return (
				<DraftReviewCommentForm
					anchor={metadata.anchor}
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
				const fileReviewState = getFileReviewState(
					fileReviewStates,
					fileDiff,
					index
				);
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
								setCopyError(undefined);
							},
						}}
						renderAnnotation={renderDraftReviewCommentAnnotation}
						renderHeaderMetadata={() => (
							<FileHeaderMetadata
								commentCount={fileCommentCount}
								label={label}
								onViewedChange={(viewed) => {
									markViewed(fileDiff, index, viewed);
								}}
								viewed={fileReviewState.viewed}
							/>
						)}
						renderHeaderPrefix={() => (
							<FileCollapseToggle
								collapsed={fileReviewState.collapsed}
								onToggle={() => {
									toggleCollapsed(fileDiff, index);
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
	<main className="review-app">
		<ReviewHeader context={session.context} />
		<section aria-label="Patch" className="review-patch">
			<ContinuousPatchDiff patch={session.patch} />
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
		return <main className="review-app">{error}</main>;
	}

	if (session === undefined) {
		return <main className="review-app">Loading Review Session...</main>;
	}

	return <ReviewSessionView session={session} />;
};

export default App;
