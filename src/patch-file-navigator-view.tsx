import { FileTree, useFileTree } from "@pierre/trees/react";

import type { PatchFileNavigatorModel } from "./patch-file-navigator";

interface PatchFileNavigatorProps {
	readonly model: PatchFileNavigatorModel;
	readonly onSelectFilePath: (path: string) => void;
}

const patchFileNavigatorTreeKeyFor = (model: PatchFileNavigatorModel) =>
	model.uniquePaths.join("\0");

const PatchFileNavigatorTree = ({
	model,
	onSelectFilePath,
}: PatchFileNavigatorProps) => {
	const { model: treeModel } = useFileTree({
		flattenEmptyDirectories: true,
		initialExpansion: "open",
		initialVisibleRowCount: 24,
		onSelectionChange: (selectedPaths) => {
			const [selectedPath] = selectedPaths;
			if (
				selectedPath !== undefined &&
				model.firstFileKeyForPath(selectedPath) !== undefined
			) {
				onSelectFilePath(selectedPath);
			}
		},
		paths: model.uniquePaths,
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
	onSelectFilePath,
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
			onSelectFilePath={onSelectFilePath}
		/>
	</aside>
);
