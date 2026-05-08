import { parsePatchFiles } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { useEffect, useMemo, useState } from "react";

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

const splitDiffOptions = { diffStyle: "split" } as const;

const fileDiffKey = (
	fileDiff: ReturnType<typeof parsePatchFiles>[number]["files"][number]
) =>
	[
		fileDiff.prevName,
		fileDiff.name,
		fileDiff.type,
		...fileDiff.hunks.map((hunk) => hunk.hunkSpecs),
	].join("\0");

export const loadReviewSession = async (
	fetchSession: FetchReviewSession = fetch
): Promise<ReviewSession> => {
	const response = await fetchSession(reviewSessionEndpoint);

	if (!response.ok) {
		throw new Error("Review Session could not be loaded.");
	}

	return response.json() as Promise<ReviewSession>;
};

const ContinuousPatchDiff = ({ patch }: { readonly patch: string }) => {
	const fileDiffs = useMemo(
		() => parsePatchFiles(patch).flatMap((parsedPatch) => parsedPatch.files),
		[patch]
	);

	return (
		<>
			{fileDiffs.map((fileDiff) => (
				<FileDiff
					fileDiff={fileDiff}
					key={fileDiffKey(fileDiff)}
					options={splitDiffOptions}
				/>
			))}
		</>
	);
};

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

	const commit = session.context.commit;

	return (
		<main className="app">
			<header className="review-header">
				<p className="eyebrow">Diffuser Review</p>
				<h1>{session.context.command}</h1>
				<p>
					{session.context.repository.workingDirectory} in{" "}
					{session.context.repository.root}
				</p>
				{commit === undefined ? undefined : (
					<p>
						{commit.shortOid} by {commit.authorName} &lt;{commit.authorEmail}
						&gt; on {commit.authoredAt}: {commit.subject}
					</p>
				)}
				<p>Captured {session.context.capturedAt}</p>
			</header>
			<section aria-label="Patch">
				<ContinuousPatchDiff patch={session.patch} />
			</section>
		</main>
	);
};

export default App;
