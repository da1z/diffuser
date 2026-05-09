import { FileTree, useFileTree } from "@pierre/trees/react";

import type {
	PatchFileNavigatorEntry,
	PatchFileNavigatorModel,
} from "./patch-file-navigator";

interface PatchFileNavigatorProps {
	readonly fileMetadataByKey: PatchFileNavigatorFileMetadataByKey;
	readonly model: PatchFileNavigatorModel;
	readonly onSelectFileKey: (fileKey: string) => void;
}

export interface PatchFileNavigatorFileMetadata {
	readonly commentCount: number;
	readonly viewed: boolean;
}

export type PatchFileNavigatorFileMetadataByKey = Readonly<
	Record<string, PatchFileNavigatorFileMetadata>
>;

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

const patchFileNavigatorReviewBadgeTextFor = (
	entry: PatchFileNavigatorEntry,
	metadata: PatchFileNavigatorFileMetadata | undefined
) => {
	const badges = [
		metadata?.viewed === true ? "Viewed" : undefined,
		metadata !== undefined && metadata.commentCount > 0
			? `${metadata.commentCount} ${
					metadata.commentCount === 1 ? "comment" : "comments"
				}`
			: undefined,
		patchFileNavigatorChangeTypeLabelFor(entry),
	].filter((badge) => badge !== undefined);

	return badges.length === 0 ? undefined : badges.join(" | ");
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

const PatchFileNavigatorTree = ({
	fileMetadataByKey,
	model,
	onSelectFileKey,
}: PatchFileNavigatorProps) => {
	const { model: treeModel } = useFileTree({
		flattenEmptyDirectories: true,
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
			if (entry === undefined) {
				return null;
			}

			const text = patchFileNavigatorReviewBadgeTextFor(
				entry,
				fileMetadataByKey[entry.fileKey]
			);
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
	fileMetadataByKey,
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
			fileMetadataByKey={fileMetadataByKey}
			key={patchFileNavigatorTreeKeyFor(model, fileMetadataByKey)}
			model={model}
			onSelectFileKey={onSelectFileKey}
		/>
	</aside>
);
