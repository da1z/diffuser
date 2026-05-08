import { PatchDiff } from "@pierre/diffs/react";
import { useEffect, useState } from "react";

import type { ReviewSession } from "./diffuser/workflow";
import "./index.css";

export interface AppProps {
	readonly initialSession?: ReviewSession;
}

export const App = ({ initialSession }: AppProps) => {
	const [session, setSession] = useState<ReviewSession | undefined>(
		initialSession
	);
	const [error, setError] = useState<string | undefined>();

	useEffect(() => {
		if (session !== undefined) {
			return;
		}

		fetch("/api/session")
			.then((response) => {
				if (!response.ok) {
					throw new Error("Review Session could not be loaded.");
				}
				return response.json() as Promise<ReviewSession>;
			})
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

	return (
		<main className="app">
			<header className="review-header">
				<p className="eyebrow">Diffuser Review</p>
				<h1>{session.context.command}</h1>
				<p>
					{session.context.repository.workingDirectory} in{" "}
					{session.context.repository.root}
				</p>
				<p>Captured {session.context.capturedAt}</p>
			</header>
			<section aria-label="Patch">
				<PatchDiff options={{ diffStyle: "split" }} patch={session.patch} />
			</section>
		</main>
	);
};

export default App;
