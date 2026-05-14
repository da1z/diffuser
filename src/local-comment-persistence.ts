import type { SubmittedDraftReviewComment } from "./review-comments";

export interface RepositoryContext {
	readonly root: string;
	readonly workingDirectory: string;
}

export interface LocalCommentStorage {
	readonly getItem: (key: string) => string | null;
	readonly removeItem: (key: string) => void;
	readonly setItem: (key: string, value: string) => void;
}

export interface DraftReviewCommentPersistenceScope {
	readonly patch: string;
	readonly repositoryContext: RepositoryContext;
	readonly storage: LocalCommentStorage;
}

export type PersistDraftReviewCommentsResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: unknown };

interface PersistedDraftReviewCommentsRecord {
	readonly comments: readonly SubmittedDraftReviewComment[];
	readonly version: 1;
}

const persistedDraftReviewCommentsSchemaVersion = 1;

const storageKeyPrefix = "diffuser:draft-review-comments:v1";

const stableHash = (value: string) => {
	let hash = 14695981039346656037n;
	const prime = 1099511628211n;
	const modulus = 18_446_744_073_709_551_616n;
	const bytes = new TextEncoder().encode(value);

	for (const byte of bytes) {
		hash = ((hash + BigInt(byte)) * prime) % modulus;
	}

	return hash.toString(36);
};

const repositoryContextIdentity = ({
	root,
	workingDirectory,
}: RepositoryContext) =>
	JSON.stringify({
		root,
		workingDirectory,
	});

const persistedDraftReviewCommentsStorageKey = ({
	patch,
	repositoryContext,
}: Omit<DraftReviewCommentPersistenceScope, "storage">) =>
	[
		storageKeyPrefix,
		stableHash(repositoryContextIdentity(repositoryContext)),
		stableHash(patch),
	].join(":");

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

const isSafeInteger = (value: unknown): value is number =>
	Number.isSafeInteger(value);

const isSubmittedDraftReviewComment = (
	value: unknown
): value is SubmittedDraftReviewComment => {
	if (!(isRecord(value) && isRecord(value.anchor))) {
		return false;
	}

	const { anchor } = value;

	return (
		isString(value.id) &&
		isString(value.body) &&
		isSafeInteger(value.order) &&
		isString(anchor.fileKey) &&
		isSafeInteger(anchor.fileOrder) &&
		isString(anchor.path) &&
		isSafeInteger(anchor.position) &&
		(anchor.side === "new" || anchor.side === "old-deleted") &&
		isSafeInteger(anchor.startLine) &&
		isSafeInteger(anchor.endLine)
	);
};

const parsePersistedDraftReviewCommentsRecord = (
	rawRecord: string
): PersistedDraftReviewCommentsRecord | undefined => {
	let value: unknown;

	try {
		value = JSON.parse(rawRecord);
	} catch {
		return;
	}

	if (
		!isRecord(value) ||
		value.version !== persistedDraftReviewCommentsSchemaVersion ||
		!Array.isArray(value.comments) ||
		!value.comments.every(isSubmittedDraftReviewComment)
	) {
		return;
	}

	return {
		comments: value.comments,
		version: persistedDraftReviewCommentsSchemaVersion,
	};
};

export const loadPersistedDraftReviewComments = (
	scope: DraftReviewCommentPersistenceScope
): readonly SubmittedDraftReviewComment[] => {
	let rawRecord: string | null;

	try {
		rawRecord = scope.storage.getItem(
			persistedDraftReviewCommentsStorageKey(scope)
		);
	} catch {
		return [];
	}

	if (rawRecord === null) {
		return [];
	}

	return parsePersistedDraftReviewCommentsRecord(rawRecord)?.comments ?? [];
};

export const savePersistedDraftReviewComments = (
	scope: DraftReviewCommentPersistenceScope,
	comments: readonly SubmittedDraftReviewComment[]
): PersistDraftReviewCommentsResult => {
	try {
		scope.storage.setItem(
			persistedDraftReviewCommentsStorageKey(scope),
			JSON.stringify({
				comments,
				version: persistedDraftReviewCommentsSchemaVersion,
			})
		);
	} catch (error) {
		return { error, ok: false };
	}

	return { ok: true };
};

export const clearPersistedDraftReviewComments = (
	scope: DraftReviewCommentPersistenceScope
): PersistDraftReviewCommentsResult => {
	try {
		scope.storage.removeItem(persistedDraftReviewCommentsStorageKey(scope));
	} catch (error) {
		return { error, ok: false };
	}

	return { ok: true };
};
