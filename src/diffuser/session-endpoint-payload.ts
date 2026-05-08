import type { CommitMetadata, ReviewSession } from "./workflow";

export interface CommitMetadataPayload {
	readonly authorEmail: string;
	readonly authoredAt: string;
	readonly authorName: string;
	readonly oid: string;
	readonly shortOid: string;
	readonly subject: string;
}

interface DiffFilePayload {
	readonly contents: string;
	readonly name: string;
}

export type DiffFileSnapshotPayload =
	| {
			readonly newFile: DiffFilePayload;
			readonly oldFile: DiffFilePayload;
			readonly status: "available";
	  }
	| {
			readonly reason: string;
			readonly status: "unavailable";
	  };

interface RepositoryContextPayload {
	readonly root: string;
	readonly workingDirectory: string;
}

interface SessionEndpointContextPayload {
	readonly args: readonly string[];
	readonly capturedAt: string;
	readonly command: string;
	readonly commit?: CommitMetadataPayload;
	readonly repository: RepositoryContextPayload;
}

export interface SessionEndpointPayload {
	readonly context: SessionEndpointContextPayload;
	readonly diffFileSnapshots: readonly DiffFileSnapshotPayload[];
	readonly id: string;
	readonly kind: "diff" | "show";
	readonly mode: "read-only";
	readonly patch: string;
}

const invalidSessionEndpointPayloadMessage =
	"Session Endpoint payload is invalid.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is readonly string[] =>
	Array.isArray(value) && value.every((item) => typeof item === "string");

const isSessionKind = (
	value: unknown
): value is SessionEndpointPayload["kind"] =>
	value === "diff" || value === "show";

const isCommitMetadataPayload = (
	value: unknown
): value is CommitMetadataPayload => {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.oid === "string" &&
		typeof value.shortOid === "string" &&
		typeof value.authorName === "string" &&
		typeof value.authorEmail === "string" &&
		typeof value.authoredAt === "string" &&
		typeof value.subject === "string"
	);
};

const isDiffFilePayload = (value: unknown): value is DiffFilePayload =>
	isRecord(value) &&
	typeof value.name === "string" &&
	typeof value.contents === "string";

const isDiffFileSnapshotPayload = (
	value: unknown
): value is DiffFileSnapshotPayload => {
	if (!isRecord(value)) {
		return false;
	}

	if (value.status === "unavailable") {
		return typeof value.reason === "string";
	}

	return (
		value.status === "available" &&
		isDiffFilePayload(value.oldFile) &&
		isDiffFilePayload(value.newFile)
	);
};

const isRepositoryContextPayload = (
	value: unknown
): value is RepositoryContextPayload =>
	isRecord(value) &&
	typeof value.root === "string" &&
	typeof value.workingDirectory === "string";

const isSessionEndpointContextPayload = (
	value: unknown
): value is SessionEndpointContextPayload =>
	isRecord(value) &&
	typeof value.command === "string" &&
	isStringArray(value.args) &&
	typeof value.capturedAt === "string" &&
	(value.commit === undefined || isCommitMetadataPayload(value.commit)) &&
	isRepositoryContextPayload(value.repository);

const isSessionEndpointPayload = (
	value: unknown
): value is SessionEndpointPayload => {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.id === "string" &&
		value.mode === "read-only" &&
		isSessionKind(value.kind) &&
		typeof value.patch === "string" &&
		Array.isArray(value.diffFileSnapshots) &&
		value.diffFileSnapshots.every(isDiffFileSnapshotPayload) &&
		isSessionEndpointContextPayload(value.context)
	);
};

export const sessionEndpointPayloadFromReviewSession = (
	session: ReviewSession
): SessionEndpointPayload => ({
	id: session.id,
	mode: session.mode,
	kind: session.kind,
	patch: session.patch,
	diffFileSnapshots: session.diffFileSnapshots,
	context: {
		command: session.context.command,
		args: session.context.args,
		capturedAt: session.context.capturedAt,
		...(session.context.commit === undefined
			? {}
			: { commit: session.context.commit }),
		repository: {
			root: session.context.repository.root,
			workingDirectory: session.context.repository.workingDirectory,
		},
	},
});

const commitMetadataFromPayload = (
	payload: CommitMetadataPayload
): CommitMetadata => ({
	oid: payload.oid,
	shortOid: payload.shortOid,
	authorName: payload.authorName,
	authorEmail: payload.authorEmail,
	authoredAt: payload.authoredAt,
	subject: payload.subject,
});

export const reviewSessionFromSessionEndpointPayload = (
	payload: unknown
): ReviewSession => {
	if (!isSessionEndpointPayload(payload)) {
		throw new Error(invalidSessionEndpointPayloadMessage);
	}

	return {
		id: payload.id,
		mode: payload.mode,
		kind: payload.kind,
		patch: payload.patch,
		diffFileSnapshots: payload.diffFileSnapshots,
		context: {
			command: payload.context.command,
			args: payload.context.args,
			capturedAt: payload.context.capturedAt,
			...(payload.context.commit === undefined
				? {}
				: { commit: commitMetadataFromPayload(payload.context.commit) }),
			repository: {
				root: payload.context.repository.root,
				workingDirectory: payload.context.repository.workingDirectory,
			},
		},
	};
};
