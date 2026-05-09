import type { FileDiffMetadata } from "@pierre/diffs/react";

import type { ContinuousDiffViewFile } from "./continuous-diff-view-interaction";

export interface PatchFileNavigatorEntry {
	readonly changeType: FileDiffMetadata["type"];
	readonly displayPath: string;
	readonly fileKey: string;
	readonly previousPath: string | undefined;
	readonly treePath: string;
}

export interface PatchFileNavigatorModel {
	readonly entries: readonly PatchFileNavigatorEntry[];
	readonly entryForTreePath: (
		path: string
	) => PatchFileNavigatorEntry | undefined;
	readonly fileKeyForTreePath: (path: string) => string | undefined;
	readonly treePaths: readonly string[];
}

export const patchFileNavigatorModelFor = (
	files: readonly ContinuousDiffViewFile[]
): PatchFileNavigatorModel => {
	const displayPaths = new Set(files.map((file) => file.label));
	const displayPathOccurrences = new Map<string, number>();
	const entryByTreePath = new Map<string, PatchFileNavigatorEntry>();
	const fileKeyByTreePath = new Map<string, string>();
	const entries: PatchFileNavigatorEntry[] = [];
	const usedTreePaths = new Set<string>();

	for (const file of files) {
		const occurrence = (displayPathOccurrences.get(file.label) ?? 0) + 1;
		displayPathOccurrences.set(file.label, occurrence);
		let treePath = file.label;
		let suffix = occurrence;
		while (
			usedTreePaths.has(treePath) ||
			(occurrence > 1 && displayPaths.has(treePath))
		) {
			treePath = `${file.label} (${suffix})`;
			suffix += 1;
		}

		const entry = {
			changeType: file.fileDiff.type,
			displayPath: file.label,
			fileKey: file.key,
			previousPath: file.fileDiff.prevName,
			treePath,
		} satisfies PatchFileNavigatorEntry;

		entryByTreePath.set(treePath, entry);
		fileKeyByTreePath.set(treePath, file.key);
		usedTreePaths.add(treePath);
		entries.push(entry);
	}

	return {
		entries,
		entryForTreePath: (path) => entryByTreePath.get(path),
		fileKeyForTreePath: (path) => fileKeyByTreePath.get(path),
		treePaths: entries.map((entry) => entry.treePath),
	};
};
