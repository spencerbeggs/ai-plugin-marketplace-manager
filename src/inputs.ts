import { ActionInput } from "@effected/github-actions";
import type { Config } from "effect";
import { Config as Cfg, Effect, Predicate } from "effect";
import { INPUT_DEFAULTS } from "./contract.js";
import { InvalidInputError } from "./errors/errors.js";
import type { PluginPatch } from "./schema/input.js";
import { decodeJsonInput } from "./schema/input.js";
import { pluginKey } from "./schema/marketplace.js";

/** Merge method for PR auto-merge. Meaningful only in `pr` mode. */
export type AutoMergeMethod = "merge" | "squash" | "rebase";

/** Fully parsed, validated action inputs. */
export interface ParsedInputs {
	readonly patches: ReadonlyArray<PluginPatch>;
	readonly mode: "commit" | "pr";
	/** `null` ⇒ resolve the repo default branch at runtime. */
	readonly baseBranch: string | null;
	readonly branch: string;
	readonly commitMessage: string | null;
	readonly prTitle: string | null;
	readonly prBody: string | null;
	/** Auto-merge method to enable on the PR. Ignored in `commit` mode. */
	readonly autoMerge: AutoMergeMethod;
	readonly dryRun: boolean;
}

const emptyToNull = (s: string): string | null => (s.length === 0 ? null : s);

const PATCH_SHAPE = '{"plugins":[{name,marketplace,sha,path?}]}';

/**
 * Reject a v1 payload by name before the generic decode.
 *
 * @remarks
 * The strict decoder would reject `url` anyway, but with a schema error a
 * dispatcher still on v1 has to decode. Senders migrating from v1 all hit this
 * one key, so it earns a message that says what v2 expects instead.
 */
const rejectLegacyUrl = (parsed: unknown): Effect.Effect<void, InvalidInputError> => {
	const plugins = Predicate.isObject(parsed) ? (parsed as { plugins?: unknown }).plugins : undefined;
	if (!Array.isArray(plugins)) {
		return Effect.void;
	}
	const index = plugins.findIndex((p) => Predicate.isObject(p) && Object.hasOwn(p, "url"));
	return index === -1
		? Effect.void
		: Effect.fail(
				new InvalidInputError({
					field: "json",
					reason: `plugins[${index}].url is not supported in v2; a patch carries name, marketplace, sha and optionally path`,
				}),
			);
};

/** One patch per (marketplace, name): two would race inside one manifest edit. */
const rejectDuplicates = (patches: ReadonlyArray<PluginPatch>): Effect.Effect<void, InvalidInputError> => {
	const seen = new Set<string>();
	for (const p of patches) {
		const key = pluginKey(p.marketplace, p.name);
		if (seen.has(key)) {
			return Effect.fail(
				new InvalidInputError({ field: "json", reason: `duplicate patch for ${p.name} in ${p.marketplace}` }),
			);
		}
		seen.add(key);
	}
	return Effect.void;
};

/**
 * Read and validate all inputs, enforcing the manual/json XOR.
 *
 * @remarks
 * Every read goes through an `ActionInput` accessor, which owns the `INPUT_`
 * derivation — no caller spells a runner variable. A bare `Config.string` would
 * also resolve here, because `Action.run` installs `ActionInput.providerOver`
 * as the default provider, which is exactly why the substitution is easy to
 * miss in review.
 *
 * Optional inputs take `Config.withDefault` because the runner writes `""` for
 * an omitted input and the kit treats missing and empty as the same *missing
 * data*. None of this action's inputs use empty as a meaningful value, so
 * `Config.option` is not needed anywhere — if one ever does, `withDefault`
 * would silently swallow it and `Config.option` is the fix.
 */
export const parseInputs: Effect.Effect<ParsedInputs, InvalidInputError | Config.ConfigError> = Effect.gen(
	function* () {
		const name = yield* ActionInput.string("name").pipe(Cfg.withDefault(""));
		const marketplace = yield* ActionInput.string("marketplace").pipe(Cfg.withDefault(""));
		const path = yield* ActionInput.string("path").pipe(Cfg.withDefault(""));
		const sha = yield* ActionInput.string("sha").pipe(Cfg.withDefault(""));
		const json = yield* ActionInput.string("json").pipe(Cfg.withDefault(""));

		// `marketplace` is deliberately NOT a manual-path signal. A consumer's
		// workflow_dispatch choice input for it carries a default, so it is
		// non-empty on every manual run — json-only ones included — and counting
		// it would turn those into spurious XOR violations.
		const hasManual = name.length > 0 || path.length > 0 || sha.length > 0;
		const hasJson = json.length > 0;

		if (hasManual && hasJson) {
			return yield* Effect.fail(
				new InvalidInputError({ field: "json", reason: "provide either the manual fields or json, not both" }),
			);
		}
		if (!hasManual && !hasJson) {
			return yield* Effect.fail(
				new InvalidInputError({
					field: "name/json",
					reason: "provide the manual fields (name, marketplace, sha) or json",
				}),
			);
		}

		let patches: ReadonlyArray<PluginPatch>;
		if (hasJson) {
			const parsed = yield* Effect.try({
				try: () => JSON.parse(json) as unknown,
				catch: () => new InvalidInputError({ field: "json", reason: "not valid JSON" }),
			});
			yield* rejectLegacyUrl(parsed);
			const decoded = yield* decodeJsonInput(parsed).pipe(
				Effect.mapError(
					(e) =>
						new InvalidInputError({ field: "json", reason: `not an object of shape ${PATCH_SHAPE}: ${String(e)}` }),
				),
			);
			patches = decoded.plugins;
		} else {
			if (name.length === 0) {
				return yield* Effect.fail(new InvalidInputError({ field: "name", reason: "required for the manual path" }));
			}
			if (marketplace.length === 0) {
				return yield* Effect.fail(
					new InvalidInputError({
						field: "marketplace",
						reason: "required for the manual path (claude-code or copilot)",
					}),
				);
			}
			if (sha.length === 0) {
				return yield* Effect.fail(new InvalidInputError({ field: "sha", reason: "required for the manual path" }));
			}
			// Decode through the same schema as the json path so both forms get
			// identical validation (sha pattern, marketplace literal) and error shape.
			const decoded = yield* decodeJsonInput({
				plugins: [{ name, marketplace, sha, ...(path.length > 0 ? { path } : {}) }],
			}).pipe(
				Effect.mapError(
					(e) =>
						new InvalidInputError({
							field: "name/marketplace/sha/path",
							reason: `invalid manual plugin patch: ${String(e)}`,
						}),
				),
			);
			patches = decoded.plugins;
		}
		yield* rejectDuplicates(patches);

		// `literals` matches exactly and fails a value outside the set as a
		// `ConfigError` naming the input, the value and the allowed set — never
		// swallowed by the default, which covers only an absent or empty input.
		const mode = yield* ActionInput.literals("mode", ["commit", "pr"]).pipe(Cfg.withDefault(INPUT_DEFAULTS.mode));

		const baseBranch = emptyToNull(yield* ActionInput.string("base-branch").pipe(Cfg.withDefault("")));
		const branch = yield* ActionInput.string("branch").pipe(Cfg.withDefault(INPUT_DEFAULTS.branch));
		const commitMessage = emptyToNull(yield* ActionInput.string("commit-message").pipe(Cfg.withDefault("")));
		const prTitle = emptyToNull(yield* ActionInput.string("pr-title").pipe(Cfg.withDefault("")));
		const prBody = emptyToNull(yield* ActionInput.string("pr-body").pipe(Cfg.withDefault("")));

		const autoMerge = yield* ActionInput.literals("auto-merge", ["merge", "squash", "rebase"]).pipe(
			Cfg.withDefault(INPUT_DEFAULTS["auto-merge"]),
		);

		// `ActionInput.boolean` fails a MALFORMED value rather than defaulting it:
		// it builds its ConfigError carrying `actual`, which is what stops
		// `withDefault` from classifying it as missing data. The pre-port library
		// shipped the opposite behavior, where `dry-run: yes` silently read false.
		const dryRun = yield* ActionInput.boolean("dry-run").pipe(Cfg.withDefault(false));

		return {
			patches,
			mode,
			baseBranch,
			branch,
			commitMessage,
			prTitle,
			prBody,
			autoMerge,
			dryRun,
		};
	},
);
