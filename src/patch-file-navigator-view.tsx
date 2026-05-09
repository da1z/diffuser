import type { GitStatusEntry } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";

import type {
	PatchFileNavigatorEntry,
	PatchFileNavigatorModel,
} from "./patch-file-navigator";

interface PatchFileNavigatorProps {
	readonly model: PatchFileNavigatorModel;
	readonly onSelectFileKey: (fileKey: string) => void;
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

const PatchFileNavigatorTree = ({
	model,
	onSelectFileKey,
}: PatchFileNavigatorProps) => {
	const { model: treeModel } = useFileTree({
		flattenEmptyDirectories: true,
		gitStatus: model.entries.flatMap((entry) => {
			const gitStatus = patchFileNavigatorGitStatusFor(entry);

			return gitStatus === undefined ? [] : [gitStatus];
		}),
		initialExpansion: "open",
		initialVisibleRowCount: 24,
		onSelectionChange: (selectedPaths) => {
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
		/>
	</aside>
);
