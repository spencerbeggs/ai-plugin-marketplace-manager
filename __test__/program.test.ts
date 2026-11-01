import { assert, describe, it } from "@effect/vitest";
import {
	GitBranch,
	GitCommit,
	GitHubRepository,
	InstallationToken,
	PullRequest,
	Repo,
	RepoRef,
} from "@effected/github";
import type { ActionStateShape } from "@effected/github-actions";
import { ActionInput, ActionOutputs, ActionState } from "@effected/github-actions";
import { MemoryFileSystem } from "@effected/memfs";
import type { FileSystem } from "effect";
import { Cause, ConfigProvider, DateTime, Effect, Exit, Layer, Option, Redacted, Schema } from "effect";
import { program } from "../src/program.js";

const SHA0 = "0".repeat(40);
const SHA1 = "1".repeat(40);
const json = (plugins: ReadonlyArray<Record<string, string>>) => JSON.stringify({ plugins });

// The bundled marketplace.json schema requires `owner` at the top level.
const MANIFEST = `{
	"name": "acme",
	"owner": { "name": "Acme" },
	"plugins": [
		{ "name": "p1", "source": { "source": "git-subdir", "url": "https://github.com/acme/p1", "path": "plugin", "sha": "${SHA0}" } }
	]
}
`;

const COPILOT_MANIFEST = `{
	"name": "acme",
	"owner": { "name": "Acme" },
	"plugins": [
		{ "name": "p1", "source": { "source": "github", "repo": "acme/p1", "path": "plugins/copilot" } },
		{ "name": "p2", "source": "plugins/p2" },
		{ "name": "p3", "source": { "source": "url", "url": "https://example.com/p.tgz" } }
	]
}
`;

/**
 * A fresh in-memory checkout holding whichever manifests are asked for (both
 * by default). memfs resolves the action's relative manifest paths from its
 * root, so no `process.chdir` is needed.
 */
const setup = ({ claude = true, copilot = true } = {}) =>
	MemoryFileSystem.layerWith({
		...(claude ? { ".claude-plugin/marketplace.json": MANIFEST } : {}),
		...(copilot ? { ".github/plugin/marketplace.json": COPILOT_MANIFEST } : {}),
	});

const liveToken = InstallationToken.make({
	token: Redacted.make("ghs_live"),
	expiresAt: DateTime.fromDateUnsafe(new Date(Date.now() + 60 * 60 * 1000)),
	installationId: 1,
	permissions: { contents: "write" },
});

interface HarnessOptions {
	/**
	 * Stub and record commit-mode landing. Only `commitFiles` is stubbed; every
	 * other landing member stays a dying `layerTest` default, so a second
	 * commit, a branch move or a PR call fails the test. `ActionState.get`
	 * serves the live token because the land path reads the bot identity for the
	 * DCO trailer. The cast is the same unavoidable one post.test.ts documents:
	 * `get` is generic in the decoded type.
	 */
	readonly landing?: boolean;
	/** Replace the recording `ActionOutputs` double (fault injection). */
	readonly outputs?: Layer.Layer<ActionOutputs>;
}

/**
 * Run `program` against fixture inputs and a fixture checkout.
 *
 * Without `landing`, the landing services are provided as **bare
 * `layerTest()` doubles with no overrides**, which is the assertion: every
 * unstubbed member dies naming itself. So "no-op and dry-run must not land" is
 * enforced by the doubles themselves rather than by counting recorded calls
 * afterward — any commit, branch or PR call at all fails the test loudly.
 * `ActionState` is bare for the same reason: reaching it would mean
 * `GitHubToken.botIdentity()` ran, which only happens past the dry-run guard.
 */
const withProgram = (
	inputs: Record<string, string>,
	checkout: Layer.Layer<FileSystem.FileSystem>,
	options: HarnessOptions = {},
) => {
	const commits: Array<{ readonly paths: ReadonlyArray<string>; readonly message: string }> = [];

	// The kit's recording double, which encodes `setJson` through its schema
	// exactly as the real layer does and records the encoded text. A drift is a
	// typed `OutputEncodeError` that `program` degrades to a warning, as in
	// production — so it surfaces here as a missing `result`, which every test
	// that reaches an emit asserts on.
	const recording = ActionOutputs.recording();
	const outputs = options.outputs ?? recording.layer;

	const layer = Layer.mergeAll(
		outputs,
		options.landing
			? ActionState.layerTest({
					get: (() => Effect.succeed(liveToken)) as unknown as ActionStateShape["get"],
				})
			: ActionState.layerTest(),
		options.landing
			? GitCommit.layerTest({
					commitFiles: ({ message, changes }) =>
						Effect.sync(() => {
							commits.push({ message, paths: changes.map((c) => c.path) });
							return "direct-commit-sha";
						}),
				})
			: GitCommit.layerTest(),
		GitBranch.layerTest(),
		PullRequest.layerTest(),
		GitHubRepository.layerTest(),
		Layer.succeed(Repo, RepoRef.make({ owner: "test-owner", repo: "test-repo" })),
		checkout,
	);

	const run = program.pipe(
		Effect.provide(layer),
		// `ActionInput.provider`, never `ConfigProvider.fromEnv`/`fromUnknown`:
		// `parseInputs` reads through `ActionInput.string`, which resolves
		// `INPUT_*`, so a provider keyed by bare input name would serve nothing and
		// every read would silently take its default.
		Effect.provide(ConfigProvider.layer(ActionInput.provider(inputs))),
	);

	return {
		run,
		commits,
		/** Every `set`/`setJson` write so far, `setJson` as its encoded JSON text. */
		get recorded(): ReadonlyArray<{ readonly name: string; readonly value: string }> {
			return recording
				.entries()
				.flatMap((e) =>
					(e.member === "set" || e.member === "setJson") && e.name !== undefined
						? [{ name: e.name, value: e.value }]
						: [],
				);
		},
		get summaries(): ReadonlyArray<string> {
			return recording
				.entries()
				.filter((e) => e.member === "summary")
				.map((e) => e.value);
		},
	};
};

const outputValue = (recorded: ReadonlyArray<{ name: string; value: string }>, name: string) =>
	recorded.find((o) => o.name === name)?.value;

/** The rendered cause of a failed exit; empty for a success. */
const failureText = (exit: Exit.Exit<unknown, unknown>) => (Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "");

describe("program", () => {
	it.effect("dry-run emits a result and never lands", () =>
		Effect.gen(function* () {
			const h = withProgram(
				{ name: "p1", marketplace: "claude-code", sha: SHA1, "dry-run": "true", "base-branch": "main" },
				setup(),
			);
			yield* h.run;

			assert.strictEqual(outputValue(h.recorded, "status"), "success");
			assert.strictEqual(outputValue(h.recorded, "changed"), "true");
			assert.strictEqual(outputValue(h.recorded, "plugins-updated"), "1");
			assert.isDefined(outputValue(h.recorded, "result"));
			// Nothing landed: the commit/branch/PR doubles would have died.
			assert.strictEqual(outputValue(h.recorded, "commit-sha"), "");
			assert.strictEqual(outputValue(h.recorded, "pr-number"), "");
			assert.lengthOf(h.summaries, 1);
		}),
	);

	it.effect("a no-op edit reports status no-op, changed false, and skips validation and landing", () =>
		Effect.gen(function* () {
			// Patching p1 to the sha it already has is byte-stable.
			const h = withProgram({ name: "p1", marketplace: "claude-code", sha: SHA0, "base-branch": "main" }, setup());
			yield* h.run;

			assert.strictEqual(outputValue(h.recorded, "status"), "no-op");
			assert.strictEqual(outputValue(h.recorded, "changed"), "false");
			assert.strictEqual(outputValue(h.recorded, "plugins-updated"), "0");
			assert.strictEqual(outputValue(h.recorded, "commit-sha"), "");
		}),
	);

	it.effect("every terminal path emits a result output", () =>
		Effect.gen(function* () {
			const noop = withProgram({ name: "p1", marketplace: "claude-code", sha: SHA0, "base-branch": "main" }, setup());
			yield* noop.run;
			assert.isDefined(outputValue(noop.recorded, "result"));

			const dry = withProgram(
				{ name: "p1", marketplace: "claude-code", sha: SHA1, "dry-run": "true", "base-branch": "main" },
				setup(),
			);
			yield* dry.run;
			assert.isDefined(outputValue(dry.recorded, "result"));
		}),
	);

	it.effect("a validation failure emits a failed result AND the program still fails", () =>
		Effect.gen(function* () {
			// A plugin name that is not in the manifest fails with PluginNotFoundError.
			const h = withProgram({ name: "nope", marketplace: "claude-code", sha: SHA1, "base-branch": "main" }, setup());
			const exit = yield* Effect.exit(h.run);

			assert.isTrue(Exit.isFailure(exit));
			assert.strictEqual(outputValue(h.recorded, "status"), "failed");
			assert.strictEqual(outputValue(h.recorded, "changed"), "false");
			const result = outputValue(h.recorded, "result");
			assert.isDefined(result);
			const parsed = JSON.parse(String(result)) as { succeeded: boolean; hasFailures: boolean };
			assert.isFalse(parsed.succeeded);
			assert.isTrue(parsed.hasFailures);
		}),
	);

	it.effect("an input failure emits a failed result before re-raising", () =>
		Effect.gen(function* () {
			// Neither manual nor json — parseInputs fails before orchestration starts.
			const h = withProgram({}, setup());
			const exit = yield* Effect.exit(h.run);

			assert.isTrue(Exit.isFailure(exit));
			assert.strictEqual(outputValue(h.recorded, "status"), "failed");
			// The fallback shape for an unparsed input set.
			assert.strictEqual(outputValue(h.recorded, "mode"), "commit");
			// The structured `result` is the contract downstream consumers read,
			// so assert it directly: checking only the scalars would still pass if
			// failure reporting stopped emitting `result` altogether.
			const result = outputValue(h.recorded, "result");
			assert.isString(result);
			const parsed: unknown = JSON.parse(result as string);
			assert.deepInclude(parsed, { status: "failed", hasFailures: true });
		}),
	);

	// Failure reporting runs before the real cause is re-raised, so an output
	// write that fails while reporting must not become the reason the run
	// failed. Fault-inject `set` so every scalar write fails, then assert the
	// domain error still arrives: without the `catchCause` in `emitFailure` the
	// `yield*` short-circuits and this surfaces the output error instead.
	it.effect("an output-write failure while reporting does not displace the real cause", () =>
		Effect.gen(function* () {
			const outputs = ActionOutputs.layerTest({
				set: () => Effect.die(new Error("GITHUB_OUTPUT is gone")),
				setJson: () => Effect.die(new Error("GITHUB_OUTPUT is gone")),
				summary: () => Effect.void,
			});
			const h = withProgram({ name: "nope", marketplace: "claude-code", sha: SHA1, "base-branch": "main" }, setup(), {
				outputs,
			});
			const exit = yield* Effect.exit(h.run);

			assert.isTrue(Exit.isFailure(exit));
			const rendered = failureText(exit);
			// The domain failure is the missing plugin, not the output writer.
			assert.include(rendered, "nope");
			assert.notInclude(rendered, "GITHUB_OUTPUT is gone");
		}),
	);

	it.effect("lands both marketplaces in one commit", () =>
		Effect.gen(function* () {
			const h = withProgram(
				{
					json: json([
						{ name: "p1", marketplace: "claude-code", sha: SHA1 },
						{ name: "p1", marketplace: "copilot", sha: SHA1 },
					]),
					"base-branch": "main",
				},
				setup(),
				{ landing: true },
			);
			yield* h.run;

			assert.deepStrictEqual(
				h.commits.map((c) => c.paths),
				[[".claude-plugin/marketplace.json", ".github/plugin/marketplace.json"]],
			);
			assert.include(h.commits[0]?.message ?? "", "(claude-code, copilot)");
			assert.strictEqual(outputValue(h.recorded, "status"), "success");
			assert.strictEqual(outputValue(h.recorded, "plugins-updated"), "2");
			assert.strictEqual(outputValue(h.recorded, "commit-sha"), "direct-commit-sha");
			const result = JSON.parse(String(outputValue(h.recorded, "result"))) as { manifests: ReadonlyArray<string> };
			assert.deepStrictEqual(result.manifests, [".claude-plugin/marketplace.json", ".github/plugin/marketplace.json"]);
		}),
	);

	it.effect("leaves a byte-stable manifest out of the commit", () =>
		Effect.gen(function* () {
			const h = withProgram(
				{
					json: json([
						{ name: "p1", marketplace: "claude-code", sha: SHA0 },
						{ name: "p1", marketplace: "copilot", sha: SHA1 },
					]),
					"base-branch": "main",
				},
				setup(),
				{ landing: true },
			);
			yield* h.run;
			assert.deepStrictEqual(
				h.commits.map((c) => c.paths),
				[[".github/plugin/marketplace.json"]],
			);
			assert.strictEqual(outputValue(h.recorded, "plugins-updated"), "1");
		}),
	);

	it.effect("a manual copilot patch lands only the copilot manifest", () =>
		Effect.gen(function* () {
			const h = withProgram(
				{ name: "p1", marketplace: "copilot", sha: SHA1, path: "plugins/copilot-v2", "base-branch": "main" },
				setup(),
				{ landing: true },
			);
			yield* h.run;
			assert.deepStrictEqual(
				h.commits.map((c) => c.paths),
				[[".github/plugin/marketplace.json"]],
			);
		}),
	);

	// A checkout with ONLY the Copilot manifest — no `.claude-plugin/` at all.
	// Pins "only manifests some patch targets are read": a copilot-only patch
	// against this checkout can succeed only if `runOrchestration` never reads
	// `.claude-plugin/marketplace.json` for a run that never targets it.
	it.effect("a copilot-only checkout succeeds without a Claude manifest present", () =>
		Effect.gen(function* () {
			const h = withProgram(
				{ name: "p1", marketplace: "copilot", sha: SHA1, "base-branch": "main" },
				setup({ claude: false }),
				{ landing: true },
			);
			yield* h.run;
			assert.deepStrictEqual(
				h.commits.map((c) => c.paths),
				[[".github/plugin/marketplace.json"]],
			);
		}),
	);

	it.effect("a missing targeted manifest fails the run and lands nothing", () =>
		Effect.gen(function* () {
			// Bare doubles: any landing call would die.
			const h = withProgram(
				{
					json: json([
						{ name: "p1", marketplace: "claude-code", sha: SHA1 },
						{ name: "p1", marketplace: "copilot", sha: SHA1 },
					]),
					"base-branch": "main",
				},
				setup({ copilot: false }),
			);
			const exit = yield* Effect.exit(h.run);
			assert.isTrue(Exit.isFailure(exit));
			assert.include(failureText(exit), "Marketplace manifest not found for copilot");
			assert.strictEqual(outputValue(h.recorded, "status"), "failed");

			// The prose assertion above proves a readable message; this pins the
			// typed failure itself — the `_tag` a caller would `catchTag` on, and
			// the structured fields naming exactly which manifest was missing.
			const errorOption = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : Option.none();
			assert.isTrue(Option.isSome(errorOption));
			if (Option.isSome(errorOption)) {
				const error = errorOption.value as { _tag: string; marketplace: string; path: string };
				assert.strictEqual(error._tag, "ManifestNotFoundError");
				assert.strictEqual(error.marketplace, "copilot");
				assert.strictEqual(error.path, ".github/plugin/marketplace.json");
			}
		}),
	);

	// p2's source is a bare path string: structurally allowed, not pinnable.
	// `applyPatches` now rejects a bare-string source before attempting any
	// JSONC write (round-1 review fix), reusing the descriptor's
	// `sourceErrors` so the message reads the same as the validator's own
	// "source.source must be..." — readable, naming the plugin, rather than
	// the JsoncModifier's path-only error.
	it.effect("an invalid copilot edit lands nothing, even when the claude edit is valid", () =>
		Effect.gen(function* () {
			const h = withProgram(
				{
					json: json([
						{ name: "p1", marketplace: "claude-code", sha: SHA1 },
						{ name: "p2", marketplace: "copilot", sha: SHA1 },
					]),
					"base-branch": "main",
				},
				setup(),
			);
			const exit = yield* Effect.exit(h.run);
			assert.isTrue(Exit.isFailure(exit));
			assert.include(failureText(exit), 'p2: source.source must be "github"');
			assert.strictEqual(outputValue(h.recorded, "status"), "failed");
		}),
	);

	// p3's source is a well-formed object, but `source.source` is "url" rather
	// than "github" — an unpinnable source shape Review Focus 4 flagged.
	// Structural (ajv) validation is permissive about this and passes; only the
	// semantic layer rejects it. Bare doubles: any landing call would die.
	it.effect("an unpinnable url-sourced copilot entry fails validation and lands nothing", () =>
		Effect.gen(function* () {
			const h = withProgram(
				{
					json: json([
						{ name: "p1", marketplace: "claude-code", sha: SHA1 },
						{ name: "p3", marketplace: "copilot", sha: SHA1 },
					]),
					"base-branch": "main",
				},
				setup(),
			);
			const exit = yield* Effect.exit(h.run);
			assert.isTrue(Exit.isFailure(exit));
			assert.include(failureText(exit), 'p3: source.source must be "github"');
			assert.strictEqual(outputValue(h.recorded, "status"), "failed");
		}),
	);
});
