import type { ContinuousDiffViewFile } from "./continuous-diff-view-interaction";

export interface PatchFileNavigatorModel {
	readonly firstFileKeyForPath: (path: string) => string | undefined;
	readonly uniquePaths: readonly string[];
}

export const patchFileNavigatorModelFor = (
	files: readonly ContinuousDiffViewFile[]
): PatchFileNavigatorModel => {
	const firstFileKeyByPath = new Map<string, string>();
	const uniquePaths: string[] = [];

	for (const file of files) {
		if (firstFileKeyByPath.has(file.label)) {
			continue;
		}

		firstFileKeyByPath.set(file.label, file.key);
		uniquePaths.push(file.label);
	}

	return {
		firstFileKeyForPath: (path) => firstFileKeyByPath.get(path),
		uniquePaths,
	};
};
