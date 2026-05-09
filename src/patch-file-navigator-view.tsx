import type { GitStatusEntry } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useRef } from "react";

import type {
	PatchFileNavigatorEntry,
	PatchFileNavigatorModel,
} from "./patch-file-navigator";

interface PatchFileNavigatorProps {
	readonly model: PatchFileNavigatorModel;
	readonly onSelectFileKey: (fileKey: string) => void;
	readonly selectedFileKey: string | undefined;
}

const patchFileNavigatorTreeKeyFor = (model: PatchFileNavigatorModel) =>
	model.treePaths.join("\0");

const patchFileNavigatorGitStatusFor = (
	entry: PatchFileNavigatorEntry
): GitStatusEntry | undefined => {
	switch (entry.changeType) {
		case "change":
			return { path: entry.treePath, status: "modified" };
		case "deleted":
			return { path: entry.treePath, status: "deleted" };
		case "new":
			return { path: entry.treePath, status: "added" };
		case "rename-changed":
		case "rename-pure":
			return { path: entry.treePath, status: "renamed" };
		default:
			return;
	}
};

const patchFileNavigatorTreePathForFileKey = (
	model: PatchFileNavigatorModel,
	fileKey: string | undefined
) => model.entries.find((entry) => entry.fileKey === fileKey)?.treePath;

const areSelectedTreePathsEqual = (
	currentPaths: readonly string[],
	selectedTreePath: string | undefined
) =>
	selectedTreePath === undefined
		? currentPaths.length === 0
		: currentPaths.length === 1 && currentPaths[0] === selectedTreePath;

const PatchFileNavigatorTree = ({
	model,
	onSelectFileKey,
	selectedFileKey,
}: PatchFileNavigatorProps) => {
	const isSyncingCurrentSelection = useRef(false);
	const { model: treeModel } = useFileTree({
		flattenEmptyDirectories: true,
		gitStatus: model.entries.flatMap((entry) => {
			const gitStatus = patchFileNavigatorGitStatusFor(entry);

			return gitStatus === undefined ? [] : [gitStatus];
		}),
		initialExpansion: "open",
		initialVisibleRowCount: 24,
		onSelectionChange: (selectedPaths) => {
			if (isSyncingCurrentSelection.current) {
				return;
			}

			const [selectedPath] = selectedPaths;
			if (selectedPath === undefined) {
				return;
			}

			const selectedFileKey = model.fileKeyForTreePath(selectedPath);
			if (selectedFileKey !== undefined) {
				onSelectFileKey(selectedFileKey);
			}
		},
		paths: model.treePaths,
		renderRowDecoration: ({ item }) => {
			const entry = model.entryForTreePath(item.path);

			if (entry?.previousPath === undefined) {
				return null;
			}

			return {
				text: "renamed",
				title: `Renamed from ${entry.previousPath}`,
			};
		},
	});
	const selectedTreePath = patchFileNavigatorTreePathForFileKey(
		model,
		selectedFileKey
	);

	useEffect(() => {
		const currentSelectedPaths = treeModel.getSelectedPaths();
		if (areSelectedTreePathsEqual(currentSelectedPaths, selectedTreePath)) {
			return;
		}

		isSyncingCurrentSelection.current = true;
		try {
			for (const path of currentSelectedPaths) {
				treeModel.getItem(path)?.deselect();
			}
			if (selectedTreePath !== undefined) {
				treeModel.getItem(selectedTreePath)?.select();
			}
		} finally {
			isSyncingCurrentSelection.current = false;
		}
	}, [selectedTreePath, treeModel]);

	return (
		<FileTree
			aria-label="Patch File Navigator"
			className="patch-file-navigator-tree"
			model={treeModel}
		/>
	);
};

export const PatchFileNavigatorSidebar = ({
	model,
	onSelectFileKey,
	selectedFileKey,
}: PatchFileNavigatorProps) => (
	<aside
		aria-labelledby="patch-file-navigator-heading"
		className="patch-file-navigator-shell"
	>
		<h2
			className="patch-file-navigator-heading"
			id="patch-file-navigator-heading"
		>
			Patch Files
		</h2>
		<PatchFileNavigatorTree
			key={patchFileNavigatorTreeKeyFor(model)}
			model={model}
			onSelectFileKey={onSelectFileKey}
			selectedFileKey={selectedFileKey}
		/>
	</aside>
);
