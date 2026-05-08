import {
	type FileDiffMetadata,
	GIT_DIFF_FILE_BREAK_REGEX,
	parsePatchFiles,
} from "@pierre/diffs";

export interface ParsedPatchFileEntry {
	readonly fileDiff: FileDiffMetadata;
	readonly patchFileEntry: string | undefined;
}

export interface PatchFileEntryAlignment<Snapshot>
	extends ParsedPatchFileEntry {
	readonly snapshot: Snapshot | undefined;
}

const splitPatchIntoFileEntries = (patch: string) =>
	patch
		.split(GIT_DIFF_FILE_BREAK_REGEX)
		.filter((entry) => entry.startsWith("diff --git"));

export const parsePatchFileEntries = (
	patch: string
): readonly ParsedPatchFileEntry[] => {
	const patchFileEntries = splitPatchIntoFileEntries(patch);

	return parsePatchFiles(patch)
		.flatMap((parsedPatch) => parsedPatch.files)
		.map((fileDiff, index) => ({
			fileDiff,
			patchFileEntry: patchFileEntries[index],
		}));
};

export const alignPatchFileEntries = <Snapshot>({
	patch,
	snapshots,
}: {
	readonly patch: string;
	readonly snapshots: readonly Snapshot[];
}): readonly PatchFileEntryAlignment<Snapshot>[] =>
	parsePatchFileEntries(patch).map((entry, index) => ({
		...entry,
		snapshot: snapshots[index],
	}));
