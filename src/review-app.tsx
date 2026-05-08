import { type FileDiffOptions, parsePatchFiles } from "@pierre/diffs";
import {
	FileDiff,
	type FileDiffMetadata,
	type FileDiffProps,
} from "@pierre/diffs/react";
import { type ComponentType, useEffect, useMemo, useState } from "react";

import { reviewSessionEndpoint } from "./diffuser/protocol";
import type { ReviewSession } from "./diffuser/workflow";
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
interface FileReviewState {
	readonly collapsed: boolean;
	readonly viewed: boolean;
}
type FileReviewStates = Record<string, FileReviewState | undefined>;
export interface FileDiffRendererProps
	extends Pick<
		FileDiffProps<undefined>,
		"fileDiff" | "options" | "renderHeaderMetadata" | "renderHeaderPrefix"
	> {}

export const continuousDiffViewOptions = {
	diffStyle: "split",
	hunkSeparators: "line-info-basic",
} as const satisfies FileDiffOptions<undefined>;
const initialFileReviewState: FileReviewState = {
	viewed: false,
	collapsed: false,
};

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

const ViewedFileControl = ({
	label,
	onViewedChange,
	viewed,
}: ViewedFileControlProps) => (
	<label className="viewed-file-control">
		<input
			aria-label={`Mark ${label} viewed`}
			checked={viewed}
			onChange={(event) => {
				onViewedChange(event.currentTarget.checked);
			}}
			type="checkbox"
		/>
		Viewed
	</label>
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

export const ContinuousPatchDiff = ({
	patch,
	DiffRenderer = FileDiff,
}: {
	readonly patch: string;
	readonly DiffRenderer?: ComponentType<FileDiffRendererProps>;
}) => {
	const [fileReviewStates, setFileReviewStates] = useState<FileReviewStates>(
		{}
	);
	const fileDiffs = useMemo(
		() => parsePatchFiles(patch).flatMap((parsedPatch) => parsedPatch.files),
		[patch]
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

	return (
		<>
			{fileDiffs.map((fileDiff, index) => {
				const key = fileDiffKey(fileDiff, index);
				const fileReviewState = getFileReviewState(fileReviewStates, key);
				const label = fileReviewLabel(fileDiff);

				return (
					<DiffRenderer
						fileDiff={fileDiff}
						key={key}
						options={{
							...continuousDiffViewOptions,
							collapsed: fileReviewState.collapsed,
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

	if (error !== undefined) {
		return <main className="app">{error}</main>;
	}

	if (session === undefined) {
		return <main className="app">Loading Review Session...</main>;
	}

	return <ReviewSessionView session={session} />;
};

export default App;
