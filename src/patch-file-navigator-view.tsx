import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useRef } from "react";

import type {
	PatchFileNavigatorEntry,
	PatchFileNavigatorModel,
} from "./patch-file-navigator";

interface PatchFileNavigatorProps {
	readonly fileMetadataByKey: PatchFileNavigatorFileMetadataByKey;
	readonly model: PatchFileNavigatorModel;
	readonly onSelectFileKey: (fileKey: string) => void;
	readonly selectedFileKey: string | undefined;
}

export interface PatchFileNavigatorFileMetadata {
	readonly commentCount: number;
	readonly viewed: boolean;
}

export type PatchFileNavigatorFileMetadataByKey = Readonly<
	Record<string, PatchFileNavigatorFileMetadata>
>;

interface PatchFileNavigatorRowDecoration {
	readonly text: string;
	readonly title?: string;
}

const patchFileNavigatorChangeTypeLabelFor = (
	entry: PatchFileNavigatorEntry
): string | undefined => {
	switch (entry.changeType) {
		case "change":
			return "modified";
		case "deleted":
			return "deleted";
		case "new":
			return "added";
		case "rename-changed":
		case "rename-pure":
			return "renamed";
		default:
			return;
	}
};

const patchFileNavigatorCommentCountLabelFor = (commentCount: number) => {
	if (commentCount <= 0) {
		return;
	}

	if (commentCount === 1) {
		return "1 comment";
	}

	return `${commentCount} comments`;
};

const patchFileNavigatorReviewBadgeTextFor = (
	entry: PatchFileNavigatorEntry,
	metadata: PatchFileNavigatorFileMetadata | undefined
) => {
	const badges = [
		metadata?.viewed === true ? "Viewed" : undefined,
		patchFileNavigatorCommentCountLabelFor(metadata?.commentCount ?? 0),
		patchFileNavigatorChangeTypeLabelFor(entry),
	].filter((badge) => badge !== undefined);

	return badges.length === 0 ? undefined : badges.join(" | ");
};

const patchFileNavigatorRowDecorationFor = (
	entry: PatchFileNavigatorEntry,
	metadata: PatchFileNavigatorFileMetadata | undefined
): PatchFileNavigatorRowDecoration | null => {
	const text = patchFileNavigatorReviewBadgeTextFor(entry, metadata);
	if (text === undefined) {
		return null;
	}

	if (entry.previousPath === undefined) {
		return { text };
	}

	return {
		text,
		title: `Renamed from ${entry.previousPath}`,
	};
};

const patchFileNavigatorTreeKeyFor = (
	model: PatchFileNavigatorModel,
	fileMetadataByKey: PatchFileNavigatorFileMetadataByKey
) =>
	model.entries
		.map((entry) =>
			[
				entry.treePath,
				patchFileNavigatorReviewBadgeTextFor(
					entry,
					fileMetadataByKey[entry.fileKey]
				),
			].join("\0")
		)
		.join("\0\0");

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

const syncPatchFileNavigatorTreeSelection = (
	treeModel: ReturnType<typeof useFileTree>["model"],
	selectedTreePath: string | undefined
) => {
	const currentSelectedPaths = treeModel.getSelectedPaths();
	if (areSelectedTreePathsEqual(currentSelectedPaths, selectedTreePath)) {
		return;
	}

	for (const path of currentSelectedPaths) {
		treeModel.getItem(path)?.deselect();
	}
	if (selectedTreePath !== undefined) {
		treeModel.getItem(selectedTreePath)?.select();
	}
};

const PatchFileNavigatorTree = ({
	fileMetadataByKey,
	model,
	onSelectFileKey,
	selectedFileKey,
}: PatchFileNavigatorProps) => {
	const isSyncingTreeSelection = useRef(false);
	const { model: treeModel } = useFileTree({
		flattenEmptyDirectories: true,
		initialExpansion: "open",
		initialVisibleRowCount: 24,
		onSelectionChange: (selectedPaths) => {
			if (isSyncingTreeSelection.current) {
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
			if (entry === undefined) {
				return null;
			}

			return patchFileNavigatorRowDecorationFor(
				entry,
				fileMetadataByKey[entry.fileKey]
			);
		},
	});
	const selectedTreePath = patchFileNavigatorTreePathForFileKey(
		model,
		selectedFileKey
	);

	useEffect(() => {
		isSyncingTreeSelection.current = true;
		try {
			syncPatchFileNavigatorTreeSelection(treeModel, selectedTreePath);
		} finally {
			isSyncingTreeSelection.current = false;
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
	fileMetadataByKey,
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
			fileMetadataByKey={fileMetadataByKey}
			key={patchFileNavigatorTreeKeyFor(model, fileMetadataByKey)}
			model={model}
			onSelectFileKey={onSelectFileKey}
			selectedFileKey={selectedFileKey}
		/>
	</aside>
);
