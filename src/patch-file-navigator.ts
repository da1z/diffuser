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

interface UniqueTreePathOptions {
	readonly displayPath: string;
	readonly occurrence: number;
	readonly realDisplayPaths: ReadonlySet<string>;
	readonly usedTreePaths: ReadonlySet<string>;
}

const uniqueTreePathFor = ({
	displayPath,
	occurrence,
	realDisplayPaths,
	usedTreePaths,
}: UniqueTreePathOptions) => {
	let treePath = displayPath;
	let suffix = occurrence;

	while (
		usedTreePaths.has(treePath) ||
		(occurrence > 1 && realDisplayPaths.has(treePath))
	) {
		treePath = `${displayPath} (${suffix})`;
		suffix += 1;
	}

	return treePath;
};

export const patchFileNavigatorModelFor = (
	files: readonly ContinuousDiffViewFile[]
): PatchFileNavigatorModel => {
	const realDisplayPaths = new Set(files.map((file) => file.label));
	const seenDisplayPathCounts = new Map<string, number>();
	const entryByTreePath = new Map<string, PatchFileNavigatorEntry>();
	const entries: PatchFileNavigatorEntry[] = [];
	const usedTreePaths = new Set<string>();

	for (const file of files) {
		const occurrence = (seenDisplayPathCounts.get(file.label) ?? 0) + 1;
		seenDisplayPathCounts.set(file.label, occurrence);
		const treePath = uniqueTreePathFor({
			displayPath: file.label,
			occurrence,
			realDisplayPaths,
			usedTreePaths,
		});

		const entry = {
			changeType: file.fileDiff.type,
			displayPath: file.label,
			fileKey: file.key,
			previousPath: file.fileDiff.prevName,
			treePath,
		} satisfies PatchFileNavigatorEntry;

		entryByTreePath.set(treePath, entry);
		usedTreePaths.add(treePath);
		entries.push(entry);
	}

	return {
		entries,
		entryForTreePath: (path) => entryByTreePath.get(path),
		fileKeyForTreePath: (path) => entryByTreePath.get(path)?.fileKey,
		treePaths: entries.map((entry) => entry.treePath),
	};
};
