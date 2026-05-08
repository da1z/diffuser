import { $ } from "bun";
import { Data, Effect } from "effect";

export type DiffuserCommand =
	| {
			readonly kind: "help";
			readonly openBrowser: boolean;
	  }
	| {
			readonly kind: "diff";
			readonly openBrowser: boolean;
			readonly gitArgs: readonly string[];
	  }
	| {
			readonly kind: "show";
			readonly openBrowser: boolean;
			readonly gitArgs: readonly string[];
	  };

export interface GitResult {
	readonly stderr: string;
	readonly stdout: string;
}

export interface GitAdapter {
	readonly diff: (input: {
		readonly args: readonly string[];
		readonly cwd: string;
	}) => Effect.Effect<GitResult, GitError>;
	readonly repositoryRoot: (input: {
		readonly cwd: string;
	}) => Effect.Effect<string, GitError>;
}

export interface ReviewSession {
	readonly context: {
		readonly command: string;
		readonly args: readonly string[];
		readonly capturedAt: string;
		readonly repository: {
			readonly root: string;
			readonly workingDirectory: string;
		};
	};
	readonly id: string;
	readonly kind: "diff";
	readonly mode: "read-only";
	readonly patch: string;
}

export class ParseError extends Data.TaggedError("ParseError")<{
	readonly message: string;
}> {}

export class GitError extends Data.TaggedError("GitError")<{
	readonly message: string;
	readonly stderr?: string;
}> {}

export class EmptyPatchError extends Data.TaggedError("EmptyPatchError")<{
	readonly message: string;
}> {}

export interface DiffWorkflowInput {
	readonly argv: readonly string[];
	readonly cwd: string;
	readonly git: GitAdapter;
	readonly now: () => Date;
}

export const diffuserHelp = `Usage:
  diffuser [--no-open] diff [git diff args]

Creates an immutable, read-only Review Session from git diff output.

Options:
  --no-open  Print the local Review Session URL without opening a browser.
`;

export const parseDiffuserCommand = (
	argv: readonly string[]
): DiffuserCommand => {
	let openBrowser = true;
	let index = 0;

	if (argv[index] === "--no-open") {
		openBrowser = false;
		index += 1;
	}

	const subcommand = argv[index];

	switch (subcommand) {
		case "diff":
			return {
				kind: "diff",
				openBrowser,
				gitArgs: argv.slice(index + 1),
			};
		case "show":
			return {
				kind: "show",
				openBrowser,
				gitArgs: argv.slice(index + 1),
			};
		default:
			return { kind: "help", openBrowser };
	}
};

const formatDiffCommand = (args: readonly string[]) =>
	["diffuser", "diff", ...args].join(" ");

const runGit = (
	cwd: string,
	args: readonly string[]
): Effect.Effect<GitResult, GitError> =>
	Effect.tryPromise({
		try: async () => {
			const output = await $`git ${args}`.cwd(cwd).nothrow().quiet();
			const stdout = output.stdout.toString();
			const stderr = output.stderr.toString();

			if (output.exitCode !== 0) {
				throw new GitError({
					message: `git ${args.join(" ")} failed`,
					stderr,
				});
			}

			return { stdout, stderr };
		},
		catch: (error) =>
			error instanceof GitError
				? error
				: new GitError({
						message:
							error instanceof Error ? error.message : "Git command failed",
					}),
	});

export const bunGitAdapter: GitAdapter = {
	diff: ({ args, cwd }) => runGit(cwd, ["diff", ...args]),
	repositoryRoot: ({ cwd }) =>
		Effect.map(runGit(cwd, ["rev-parse", "--show-toplevel"]), ({ stdout }) =>
			stdout.trim()
		),
};

export const createDiffReviewSession = ({
	argv,
	cwd,
	now,
	git,
}: DiffWorkflowInput): Effect.Effect<
	ReviewSession,
	ParseError | GitError | EmptyPatchError
> =>
	Effect.gen(function* () {
		const command = parseDiffuserCommand(argv);

		if (command.kind !== "diff") {
			return yield* new ParseError({
				message: "Expected diffuser diff arguments.",
			});
		}

		const result = yield* git.diff({ args: command.gitArgs, cwd });
		const patch = result.stdout;

		if (patch.trim().length === 0) {
			return yield* new EmptyPatchError({
				message: "Git produced an empty Patch.",
			});
		}

		const repositoryRoot = yield* git.repositoryRoot({ cwd });
		const capturedAt = now().toISOString();

		return {
			id: `diff-${capturedAt}`,
			mode: "read-only",
			kind: "diff",
			patch,
			context: {
				command: formatDiffCommand(command.gitArgs),
				args: command.gitArgs,
				capturedAt,
				repository: {
					root: repositoryRoot,
					workingDirectory: cwd,
				},
			},
		};
	});
