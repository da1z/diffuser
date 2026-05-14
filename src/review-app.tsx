import type { DiffLineAnnotation, FileDiffOptions } from "@pierre/diffs";
import { FileDiff, type FileDiffProps } from "@pierre/diffs/react";
import { IconCheckboxFill, IconChevronSm, IconSquircleLg } from "@pierre/icons";
import {
	type ComponentType,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";

import { formatCommentAnchorLocation } from "./comment-anchor-location";
import {
	type ContinuousDiffViewInteraction,
	cancelContinuousDiffViewDraftReviewComment,
	confirmClearContinuousDiffViewDraftReviewComments,
	continuousDiffViewDraftReviewCommentCountsByFileKey,
	continuousDiffViewFileState,
	continuousDiffViewSelectedLinesForFile,
	copyContinuousDiffViewReview,
	createContinuousDiffViewInteraction,
	deleteContinuousDiffViewDraftReviewComment,
	markContinuousDiffViewFileViewed,
	selectContinuousDiffViewLines,
	submitContinuousDiffViewDraftReviewComment,
	toggleContinuousDiffViewFileCollapsed,
} from "./continuous-diff-view-interaction";
import {
	reviewSessionEndpoint,
	reviewSessionShutdownEndpoint,
} from "./diffuser/protocol";
import { reviewSessionFromSessionEndpointPayload } from "./diffuser/session-endpoint-payload";
import type { ReviewSession } from "./diffuser/workflow";
import {
	clearPersistedDraftReviewComments,
	type DraftReviewCommentPersistenceScope,
	loadPersistedDraftReviewComments,
	type RepositoryContext,
	savePersistedDraftReviewComments,
} from "./local-comment-persistence";
import { patchFileNavigatorModelFor } from "./patch-file-navigator";
import {
	type PatchFileNavigatorFileMetadataByKey,
	PatchFileNavigatorSidebar,
} from "./patch-file-navigator-view";
import type {
	DraftReviewCommentAnchor,
	SubmittedDraftReviewComment,
} from "./review-comments";
import { draftReviewCommentStateWithSubmittedComments } from "./review-comments";
import "./index.css";

type PatchPersistence =
	| { readonly kind: "none" }
	| { readonly kind: "storage-unavailable" }
	| {
			readonly kind: "ready";
			readonly scope: DraftReviewCommentPersistenceScope;
	  };

type PersistenceWarningSync =
	| { readonly kind: "unchanged" }
	| { readonly kind: "set"; readonly message: string | undefined };

const draftReviewCommentPersistenceFailureMessage =
	"Draft comments could not be saved in this browser. They will be lost if you reload the page.";

const persistenceWarningUnlessOk = (ok: boolean): string | undefined => {
	if (ok) {
		return;
	}

	return draftReviewCommentPersistenceFailureMessage;
};

const patchPersistenceFor = (
	patch: string,
	repositoryContext: RepositoryContext | undefined
): PatchPersistence => {
	if (repositoryContext === undefined || typeof window === "undefined") {
		return { kind: "none" };
	}

	try {
		return {
			kind: "ready",
			scope: {
				patch,
				repositoryContext,
				storage: window.localStorage,
			},
		};
	} catch {
		return { kind: "storage-unavailable" };
	}
};

export interface AppProps {
	readonly initialSession?: ReviewSession;
}

type FetchReviewSession = (
	input: Parameters<typeof fetch>[0],
	init?: Parameters<typeof fetch>[1]
) => ReturnType<typeof fetch>;

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

const draftReviewCommentFormLinePrefix = (anchor: DraftReviewCommentAnchor) =>
	anchor.side === "old-deleted" ? "L" : "R";

const draftReviewCommentFormTitle = (anchor: DraftReviewCommentAnchor) => {
	const linePrefix = draftReviewCommentFormLinePrefix(anchor);

	if (anchor.startLine === anchor.endLine) {
		return `Add a comment on line ${linePrefix}${anchor.startLine}`;
	}

	return `Add a comment on lines ${linePrefix}${anchor.startLine} to ${linePrefix}${anchor.endLine}`;
};

const patchFileNavigatorFileMetadataByKeyFor = (
	interaction: ContinuousDiffViewInteraction,
	commentCountsByFileKey: Readonly<Record<string, number>>
): PatchFileNavigatorFileMetadataByKey =>
	Object.fromEntries(
		interaction.files.map((file) => {
			const fileReviewState = continuousDiffViewFileState(
				interaction,
				file.key
			);

			return [
				file.key,
				{
					commentCount: commentCountsByFileKey[file.key] ?? 0,
					viewed: fileReviewState?.viewed ?? false,
				},
			];
		})
	);

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
	persistenceWarning,
	onClear,
	onCopy,
}: {
	readonly commentCount: number;
	readonly copyError: string | undefined;
	readonly persistenceWarning: string | undefined;
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
		{persistenceWarning === undefined ? undefined : <p>{persistenceWarning}</p>}
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
	repositoryContext,
}: {
	readonly patch: string;
	readonly DiffRenderer?: ComponentType<FileDiffRendererProps>;
	readonly repositoryContext?: RepositoryContext;
}) => {
	const resolvePersistence = useCallback(
		() => patchPersistenceFor(patch, repositoryContext),
		[patch, repositoryContext]
	);
	const createInteraction = useCallback(() => {
		const persistence = resolvePersistence();

		return createContinuousDiffViewInteraction(
			patch,
			draftReviewCommentStateWithSubmittedComments(
				persistence.kind === "ready"
					? loadPersistedDraftReviewComments(persistence.scope)
					: []
			)
		);
	}, [patch, resolvePersistence]);
	const [interaction, setInteraction] = useState(() => createInteraction());
	const [persistenceWarning, setPersistenceWarning] = useState<
		string | undefined
	>();
	const [selectedNavigatorFileKey, setSelectedNavigatorFileKey] = useState<
		string | undefined
	>();
	const fileElements = useRef(new Map<string, HTMLElement>());
	useEffect(() => {
		setInteraction(createInteraction());
		setPersistenceWarning(undefined);
		setSelectedNavigatorFileKey(undefined);
		fileElements.current.clear();
	}, [createInteraction]);
	useEffect(() => {
		if (selectedNavigatorFileKey === undefined) {
			return;
		}

		fileElements.current.get(selectedNavigatorFileKey)?.scrollIntoView({
			block: "start",
		});
	}, [selectedNavigatorFileKey]);
	const navigatorModel = useMemo(
		() => patchFileNavigatorModelFor(interaction.files),
		[interaction.files]
	);
	const submittedComments =
		interaction.draftReviewCommentState.submittedComments;
	const commentCountsByFileKey =
		continuousDiffViewDraftReviewCommentCountsByFileKey(interaction);
	const navigatorFileMetadataByKey = patchFileNavigatorFileMetadataByKeyFor(
		interaction,
		commentCountsByFileKey
	);
	const cancelDraftReviewCommentForm = () => {
		setInteraction(cancelContinuousDiffViewDraftReviewComment);
	};
	const submitActiveDraftReviewComment = (body: string) => {
		const submitPersistenceResult = {
			outcome: "skipped" as "fail" | "ok" | "skipped",
		};

		flushSync(() => {
			setInteraction((state) => {
				const next = submitContinuousDiffViewDraftReviewComment(state, body);
				const persistence = resolvePersistence();

				if (persistence.kind === "ready") {
					const result = savePersistedDraftReviewComments(
						persistence.scope,
						next.draftReviewCommentState.submittedComments
					);
					submitPersistenceResult.outcome = result.ok ? "ok" : "fail";
				} else if (persistence.kind === "storage-unavailable") {
					submitPersistenceResult.outcome = "fail";
				}

				return next;
			});
		});

		if (submitPersistenceResult.outcome === "ok") {
			setPersistenceWarning(undefined);
		} else if (submitPersistenceResult.outcome === "fail") {
			setPersistenceWarning(draftReviewCommentPersistenceFailureMessage);
		}
	};
	const mirrorSubmittedDraftReviewCommentsToPersistence = (
		next: ContinuousDiffViewInteraction
	): PersistenceWarningSync => {
		const persistence = resolvePersistence();

		if (persistence.kind === "none") {
			return { kind: "unchanged" };
		}

		if (persistence.kind === "storage-unavailable") {
			return {
				kind: "set",
				message:
					next.draftReviewCommentState.submittedComments.length > 0
						? draftReviewCommentPersistenceFailureMessage
						: undefined,
			};
		}

		const scope = persistence.scope;

		if (next.draftReviewCommentState.submittedComments.length === 0) {
			const cleared = clearPersistedDraftReviewComments(scope);

			return {
				kind: "set",
				message: persistenceWarningUnlessOk(cleared.ok),
			};
		}

		const saved = savePersistedDraftReviewComments(
			scope,
			next.draftReviewCommentState.submittedComments
		);

		return {
			kind: "set",
			message: persistenceWarningUnlessOk(saved.ok),
		};
	};
	const applyPersistenceWarningSync = (sync: PersistenceWarningSync) => {
		if (sync.kind === "set") {
			setPersistenceWarning(sync.message);
		}
	};
	const deleteDraftReviewComment = (commentId: string) => {
		let sync: PersistenceWarningSync = { kind: "unchanged" };

		flushSync(() => {
			setInteraction((state) => {
				const next = deleteContinuousDiffViewDraftReviewComment(
					state,
					commentId
				);
				sync = mirrorSubmittedDraftReviewCommentsToPersistence(next);

				return next;
			});
		});

		applyPersistenceWarningSync(sync);
	};
	const copyReview = () => {
		copyContinuousDiffViewReview(interaction, navigator.clipboard).then(
			(next) => {
				flushSync(() => {
					setInteraction(next);
				});

				if (next.copyError === undefined) {
					applyPersistenceWarningSync(
						mirrorSubmittedDraftReviewCommentsToPersistence(next)
					);
				}
			}
		);
	};
	const confirmClearDraftReviewComments = () => {
		let sync: PersistenceWarningSync = { kind: "unchanged" };

		flushSync(() => {
			setInteraction((state) => {
				const next = confirmClearContinuousDiffViewDraftReviewComments(
					state,
					(message) => {
						// biome-ignore lint/suspicious/noAlert: The PRD requires the browser confirmation dialog for clearing draft comments.
						return window.confirm(message);
					}
				);
				sync = mirrorSubmittedDraftReviewCommentsToPersistence(next);

				return next;
			});
		});

		applyPersistenceWarningSync(sync);
	};
	const expandFileIfCollapsed = (fileKey: string) => {
		setInteraction((state) => {
			const fileReviewState = continuousDiffViewFileState(state, fileKey);

			if (fileReviewState?.collapsed !== true) {
				return state;
			}

			return toggleContinuousDiffViewFileCollapsed(state, fileKey);
		});
	};
	const selectNavigatorFileKey = (fileKey: string) => {
		expandFileIfCollapsed(fileKey);
		setSelectedNavigatorFileKey(fileKey);
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
			<PatchFileNavigatorSidebar
				fileMetadataByKey={navigatorFileMetadataByKey}
				model={navigatorModel}
				onSelectFileKey={selectNavigatorFileKey}
				selectedFileKey={selectedNavigatorFileKey}
			/>
			<div className="continuous-diff-view">
				{interaction.files.map((file) => {
					const fileReviewState = continuousDiffViewFileState(
						interaction,
						file.key
					);

					if (fileReviewState === undefined) {
						return null;
					}

					const fileCommentCount = commentCountsByFileKey[file.key] ?? 0;

					return (
						<div
							className={
								selectedNavigatorFileKey === file.key
									? "continuous-diff-view-file is-navigation-selected"
									: "continuous-diff-view-file"
							}
							data-review-file-label={file.label}
							key={file.key}
							ref={(element) => {
								if (element === null) {
									fileElements.current.delete(file.key);
									return;
								}

								fileElements.current.set(file.key, element);
							}}
						>
							<DiffRenderer
								fileDiff={file.fileDiff}
								lineAnnotations={draftReviewCommentLineAnnotationsForFile({
									activeAnchor: interaction.activeDraftReviewCommentAnchor,
									fileKey: file.key,
									submittedComments,
								})}
								options={{
									...continuousDiffViewOptions,
									collapsed: fileReviewState.collapsed,
									enableLineSelection: true,
									onLineSelected: (selection) => {
										setInteraction((state) =>
											selectContinuousDiffViewLines(state, file.key, selection)
										);
									},
								}}
								renderAnnotation={renderDraftReviewCommentAnnotation}
								renderHeaderMetadata={() => (
									<FileHeaderMetadata
										commentCount={fileCommentCount}
										label={file.label}
										onViewedChange={(viewed) => {
											setInteraction((state) =>
												markContinuousDiffViewFileViewed(
													state,
													file.key,
													viewed
												)
											);
										}}
										viewed={fileReviewState.viewed}
									/>
								)}
								renderHeaderPrefix={() => (
									<FileCollapseToggle
										collapsed={fileReviewState.collapsed}
										onToggle={() => {
											setInteraction((state) =>
												toggleContinuousDiffViewFileCollapsed(state, file.key)
											);
										}}
									/>
								)}
								selectedLines={continuousDiffViewSelectedLinesForFile(
									interaction,
									file.key
								)}
							/>
						</div>
					);
				})}
			</div>
			{submittedComments.length > 0 ? (
				<ReviewCommentToolbar
					commentCount={submittedComments.length}
					copyError={interaction.copyError}
					onClear={confirmClearDraftReviewComments}
					onCopy={copyReview}
					persistenceWarning={persistenceWarning}
				/>
			) : undefined}
		</>
	);
};

const ReviewHeader = ({ command }: { readonly command: string }) => (
	<header className="review-header">
		<h1>{command}</h1>
	</header>
);

const ReviewSessionView = ({
	session,
}: {
	readonly session: ReviewSession;
}) => (
	<main className="review-app">
		<ReviewHeader command={session.context.command} />
		<section aria-label="Patch" className="review-patch">
			<ContinuousPatchDiff
				patch={session.patch}
				repositoryContext={session.context.repository}
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
		return <main className="review-app">{error}</main>;
	}

	if (session === undefined) {
		return <main className="review-app">Loading Review Session...</main>;
	}

	return <ReviewSessionView session={session} />;
};

export default App;
