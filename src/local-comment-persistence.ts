import type { ReviewSession } from "./diffuser/workflow";
import type {
	DraftReviewCommentAnchor,
	SubmittedDraftReviewComment,
} from "./review-comments";

export type RepositoryContext = ReviewSession["context"]["repository"];

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

export const draftReviewCommentPersistenceFailureMessage =
	"Draft comments could not be saved in this browser. They will be lost if you reload the page.";

interface PersistedDraftReviewCommentsRecord {
	readonly comments: readonly SubmittedDraftReviewComment[];
	readonly version: 1;
}

type RawPersistedDraftReviewClassification =
	| { readonly kind: "absent" }
	| { readonly kind: "v1"; readonly record: PersistedDraftReviewCommentsRecord }
	| {
			readonly kind: "preserve";
			readonly reason: "malformed" | "unsupported-version";
	  };

const persistedDraftReviewCommentsSchemaVersion = 1;

const storageKeyPrefix = "diffuser:draft-review-comments:v1";

const stableStorageKeyHash = (value: string) => {
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

export const draftReviewCommentPersistenceStorageKey = ({
	patch,
	repositoryContext,
}: Omit<DraftReviewCommentPersistenceScope, "storage">) =>
	[
		storageKeyPrefix,
		stableStorageKeyHash(repositoryContextIdentity(repositoryContext)),
		stableStorageKeyHash(patch),
	].join(":");

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

const isSafeInteger = (value: unknown): value is number =>
	Number.isSafeInteger(value);

const isDraftReviewCommentAnchor = (
	value: unknown
): value is DraftReviewCommentAnchor =>
	isRecord(value) &&
	isString(value.fileKey) &&
	isSafeInteger(value.fileOrder) &&
	isString(value.path) &&
	isSafeInteger(value.position) &&
	(value.side === "new" || value.side === "old-deleted") &&
	isSafeInteger(value.startLine) &&
	isSafeInteger(value.endLine);

const isSubmittedDraftReviewComment = (
	value: unknown
): value is SubmittedDraftReviewComment =>
	isRecord(value) &&
	isString(value.id) &&
	isString(value.body) &&
	isSafeInteger(value.order) &&
	isDraftReviewCommentAnchor(value.anchor);

const classifyRawPersistedDraftReviewRecord = (
	rawRecord: string | null
): RawPersistedDraftReviewClassification => {
	if (rawRecord === null) {
		return { kind: "absent" };
	}

	let value: unknown;

	try {
		value = JSON.parse(rawRecord);
	} catch {
		return { kind: "preserve", reason: "malformed" };
	}

	if (!isRecord(value)) {
		return { kind: "preserve", reason: "malformed" };
	}

	if (!isSafeInteger(value.version)) {
		return { kind: "preserve", reason: "malformed" };
	}

	if (value.version !== persistedDraftReviewCommentsSchemaVersion) {
		return { kind: "preserve", reason: "unsupported-version" };
	}

	if (
		!(
			Array.isArray(value.comments) &&
			value.comments.every(isSubmittedDraftReviewComment)
		)
	) {
		return { kind: "preserve", reason: "malformed" };
	}

	return {
		kind: "v1",
		record: {
			comments: value.comments,
			version: persistedDraftReviewCommentsSchemaVersion,
		},
	};
};

export const loadPersistedDraftReviewComments = (
	scope: DraftReviewCommentPersistenceScope
): readonly SubmittedDraftReviewComment[] => {
	let rawRecord: string | null;

	try {
		rawRecord = scope.storage.getItem(
			draftReviewCommentPersistenceStorageKey(scope)
		);
	} catch {
		return [];
	}

	const classification = classifyRawPersistedDraftReviewRecord(rawRecord);

	if (classification.kind === "v1") {
		return classification.record.comments;
	}

	return [];
};

export const savePersistedDraftReviewComments = (
	scope: DraftReviewCommentPersistenceScope,
	comments: readonly SubmittedDraftReviewComment[]
): PersistDraftReviewCommentsResult => {
	let rawRecord: string | null;

	try {
		rawRecord = scope.storage.getItem(
			draftReviewCommentPersistenceStorageKey(scope)
		);
	} catch (error) {
		return { error, ok: false };
	}

	const classification = classifyRawPersistedDraftReviewRecord(rawRecord);

	if (classification.kind === "preserve") {
		let message: string;

		if (classification.reason === "unsupported-version") {
			message =
				"Persisted draft review comments use an unsupported storage version.";
		} else {
			message = "Persisted draft review comments record is unreadable.";
		}

		return {
			error: new Error(message),
			ok: false,
		};
	}

	try {
		scope.storage.setItem(
			draftReviewCommentPersistenceStorageKey(scope),
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
	let rawRecord: string | null;

	try {
		rawRecord = scope.storage.getItem(
			draftReviewCommentPersistenceStorageKey(scope)
		);
	} catch (error) {
		return { error, ok: false };
	}

	const classification = classifyRawPersistedDraftReviewRecord(rawRecord);

	if (classification.kind === "preserve") {
		return { ok: true };
	}

	try {
		scope.storage.removeItem(draftReviewCommentPersistenceStorageKey(scope));
	} catch (error) {
		return { error, ok: false };
	}

	return { ok: true };
};
