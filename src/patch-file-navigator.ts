import type { ContinuousDiffViewFile } from "./continuous-diff-view-interaction";

export interface PatchFileNavigatorModel {
	readonly fileKeyForPath: (path: string) => string | undefined;
	readonly paths: readonly string[];
}

export const patchFileNavigatorModelFor = (
	files: readonly ContinuousDiffViewFile[]
): PatchFileNavigatorModel => {
	const pathToFileKey = new Map<string, string>();
	const paths: string[] = [];

	for (const file of files) {
		if (pathToFileKey.has(file.label)) {
			continue;
		}

		pathToFileKey.set(file.label, file.key);
		paths.push(file.label);
	}

	return {
		fileKeyForPath: (path) => pathToFileKey.get(path),
		paths,
	};
};
