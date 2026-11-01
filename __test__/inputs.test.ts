import { assert, describe, it } from "@effect/vitest";
import { ActionInput } from "@effected/github-actions";
import type { Config } from "effect";
import { ConfigProvider, Effect } from "effect";
import type { InvalidInputError } from "../src/errors/errors.js";
import { parseInputs } from "../src/inputs.js";

const SHA = "1".repeat(40);

/** A complete manual-path input set; spread and extend per test. */
const MANUAL = { name: "a", marketplace: "claude-code", sha: SHA };

/** The `json` input for `plugins`. */
const json = (...plugins: ReadonlyArray<Record<string, string>>) => JSON.stringify({ plugins });

/**
 * Inputs are injected through `ActionInput.provider`, which dual-accepts
 * input-name keys (`with:`-block style) and `INPUT_`-spelled ones.
 *
 * Deliberately NOT `ConfigProvider.fromUnknown` (what the pre-port suite used)
 * or `ConfigProvider.fromEnv`. `parseInputs` now reads through
 * `ActionInput.string`, which resolves `INPUT_NAME`; a provider keyed by bare
 * input name never matches it, so every read would fall through to its default
 * and the assertions below would be testing the defaults, not the parse.
 */
const withInputs = (inputs: Record<string, string>) =>
	parseInputs.pipe(Effect.provide(ConfigProvider.layer(ActionInput.provider(inputs))));

/**
 * Narrow `parseInputs`' error union to this action's own tagged error.
 *
 * An assertion function rather than a cast: every failure below must be an
 * `InvalidInputError`, and a `ConfigError` leaking through (a misspelled input
 * name, say) should fail the test loudly instead of being quietly accepted.
 */
function assertInvalidInput(error: Config.ConfigError | InvalidInputError): asserts error is InvalidInputError {
	assert.strictEqual(error._tag, "InvalidInputError");
}

describe("parseInputs", () => {
	it.effect("parses the manual path into a single patch", () =>
		Effect.gen(function* () {
			const parsed = yield* withInputs({ name: "vitest-agent", marketplace: "claude-code", sha: SHA });
			assert.deepStrictEqual(parsed.patches, [{ name: "vitest-agent", marketplace: "claude-code", sha: SHA }]);
			assert.strictEqual(parsed.mode, "commit");
		}),
	);

	it.effect("reads inputs through the INPUT_ derivation", () =>
		Effect.gen(function* () {
			// The discriminating half of the injection concern: an INPUT_-spelled key
			// must resolve identically. If `parseInputs` regressed to a provider that
			// only served bare names, this fails while the test above still passes.
			const parsed = yield* withInputs({
				INPUT_NAME: "vitest-agent",
				INPUT_MARKETPLACE: "claude-code",
				INPUT_SHA: SHA,
			});
			assert.deepStrictEqual(parsed.patches, [{ name: "vitest-agent", marketplace: "claude-code", sha: SHA }]);
		}),
	);

	it.effect("rejects a manual-path sha that is not 40-hex lowercase", () =>
		Effect.gen(function* () {
			// The manual path decodes through the same schema as the json path, so
			// the sha pattern applies to both equally.
			const error = yield* Effect.flip(
				withInputs({ name: "vitest-agent", marketplace: "claude-code", sha: "not-a-sha" }),
			);
			assertInvalidInput(error);
			assert.strictEqual(error.field, "name/marketplace/sha/path");
		}),
	);

	it.effect("defaults auto-merge to rebase", () =>
		Effect.gen(function* () {
			const parsed = yield* withInputs({ name: "vitest-agent", marketplace: "claude-code", sha: SHA });
			assert.strictEqual(parsed.autoMerge, "rebase");
		}),
	);

	it.effect("accepts an explicit auto-merge method", () =>
		Effect.gen(function* () {
			// Asserts a NON-default method on purpose: the pre-port suite's
			// "defaults to rebase" test passed against an inert stub that returned
			// `rebase` unconditionally, so only this one proves the input was read.
			const parsed = yield* withInputs({
				name: "vitest-agent",
				marketplace: "claude-code",
				sha: SHA,
				"auto-merge": "squash",
			});
			assert.strictEqual(parsed.autoMerge, "squash");
		}),
	);

	it.effect("rejects an invalid auto-merge method", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(withInputs({ ...MANUAL, "auto-merge": "octopus" }));
			// `ActionInput.literals` fails a value outside the set as a `ConfigError`
			// naming the input and the offending value, never swallowed by the default.
			assert.strictEqual(error._tag, "ConfigError");
			assert.include(String(error), "auto-merge");
			assert.include(String(error), "octopus");
		}),
	);

	it.effect("parses the json path into multiple patches", () =>
		Effect.gen(function* () {
			const parsed = yield* withInputs({
				json: json(MANUAL, { name: "a", marketplace: "copilot", sha: SHA, path: "p" }),
			});
			assert.lengthOf(parsed.patches, 2);
		}),
	);

	it.effect("rejects a json input that is a bare array instead of a plugins envelope", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				withInputs({ json: `[{"name":"a","marketplace":"claude-code","sha":"${SHA}"}]` }),
			);
			assertInvalidInput(error);
			assert.strictEqual(error.field, "json");
		}),
	);

	it.effect("rejects json that is not valid JSON at all", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(withInputs({ json: "{not json" }));
			assertInvalidInput(error);
			assert.strictEqual(error.reason, "not valid JSON");
		}),
	);

	it.effect("rejects supplying both manual and json (XOR)", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(withInputs({ ...MANUAL, json: "[]" }));
			assertInvalidInput(error);
			assert.strictEqual(error.field, "json");
			assert.strictEqual(error.reason, "provide either the manual fields or json, not both");
		}),
	);

	it.effect("rejects neither manual nor json", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(withInputs({}));
			assertInvalidInput(error);
			assert.strictEqual(error.field, "name/json");
		}),
	);

	it.effect("does not treat a non-empty marketplace alone as the manual path", () =>
		Effect.gen(function* () {
			// A consumer's workflow_dispatch `marketplace` choice input has a default,
			// so it is non-empty on EVERY manual run — including json-only ones.
			// Counting it toward manual detection would reject those as an XOR
			// violation.
			const parsed = yield* withInputs({
				marketplace: "claude-code",
				json: json({ name: "a", marketplace: "copilot", sha: SHA }),
			});
			assert.deepStrictEqual(parsed.patches, [{ name: "a", marketplace: "copilot", sha: SHA }]);
		}),
	);

	it.effect("requires marketplace on the manual path", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(withInputs({ name: "a", sha: SHA }));
			assertInvalidInput(error);
			assert.strictEqual(error.field, "marketplace");
		}),
	);

	it.effect("requires sha on the manual path", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(withInputs({ name: "a", marketplace: "copilot", path: "p" }));
			assertInvalidInput(error);
			assert.strictEqual(error.field, "sha");
		}),
	);

	it.effect("requires name on the manual path", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(withInputs({ marketplace: "copilot", sha: SHA }));
			assertInvalidInput(error);
			assert.strictEqual(error.field, "name");
		}),
	);

	it.effect("rejects an unknown marketplace on the manual path", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(withInputs({ name: "a", marketplace: "cursor", sha: SHA }));
			assertInvalidInput(error);
			assert.strictEqual(error.field, "name/marketplace/sha/path");
		}),
	);

	it.effect("rejects an invalid mode", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(withInputs({ ...MANUAL, mode: "sideways" }));
			assert.strictEqual(error._tag, "ConfigError");
			assert.include(String(error), "mode");
			assert.include(String(error), "sideways");
		}),
	);

	it.effect("carries the non-patch inputs through", () =>
		Effect.gen(function* () {
			const parsed = yield* withInputs({
				...MANUAL,
				mode: "pr",
				"base-branch": "release",
				branch: "chore/custom",
				"commit-message": "msg",
				"pr-title": "title",
				"pr-body": "body",
				"dry-run": "true",
			});
			assert.strictEqual(parsed.mode, "pr");
			assert.strictEqual(parsed.baseBranch, "release");
			assert.strictEqual(parsed.branch, "chore/custom");
			assert.strictEqual(parsed.commitMessage, "msg");
			assert.strictEqual(parsed.prTitle, "title");
			assert.strictEqual(parsed.prBody, "body");
			assert.strictEqual(parsed.dryRun, true);
		}),
	);

	it.effect("treats omitted optional inputs as absent, not empty strings", () =>
		Effect.gen(function* () {
			const parsed = yield* withInputs(MANUAL);
			assert.strictEqual(parsed.baseBranch, null);
			assert.strictEqual(parsed.commitMessage, null);
			assert.strictEqual(parsed.prTitle, null);
			assert.strictEqual(parsed.prBody, null);
			assert.strictEqual(parsed.branch, "chore/repin-plugins");
			assert.strictEqual(parsed.dryRun, false);
		}),
	);

	it.effect("rejects a malformed dry-run rather than silently defaulting it to false", () =>
		Effect.gen(function* () {
			// The failure mode this guards: `dry-run` reaching a boolean read as
			// something like "yes" and being swallowed by the default, so a run
			// the caller believed was a dry run lands a real commit. A malformed
			// value must fail loudly — the default is for ABSENCE, not garbage.
			const error = yield* withInputs({ ...MANUAL, "dry-run": "yes" }).pipe(Effect.flip);

			// Deliberately NOT `assertInvalidInput`: `dry-run` is a `Config` read
			// (`ActionInput.boolean` + `withDefault`), so a malformed value fails
			// as a `ConfigError` before this module's own validation runs. Asserting
			// `InvalidInputError` here would assert the opposite of the truth — and
			// that helper exists precisely to catch a `ConfigError` leaking through.
			assert.strictEqual(error._tag, "ConfigError");
			// Name the input too, so an unrelated failure cannot keep this green.
			assert.include(String(error), "dry-run");
		}),
	);

	it.effect("rejects a v1 json payload carrying url with a migration message", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				withInputs({
					json: json({ ...MANUAL, url: "https://github.com/a/b" }),
				}),
			);
			assertInvalidInput(error);
			assert.strictEqual(error.field, "json");
			assert.include(error.reason, "plugins[0].url");
			assert.include(error.reason, "marketplace");
		}),
	);

	it.effect("rejects a duplicate (marketplace, name) pair", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				withInputs({
					json: json(
						{ name: "a", marketplace: "copilot", sha: SHA },
						{ name: "a", marketplace: "copilot", sha: "2".repeat(40) },
					),
				}),
			);
			assertInvalidInput(error);
			assert.strictEqual(error.field, "json");
			assert.include(error.reason, "duplicate");
		}),
	);

	it.effect("allows one name in both marketplaces", () =>
		Effect.gen(function* () {
			const parsed = yield* withInputs({
				json: json(MANUAL, { ...MANUAL, marketplace: "copilot" }),
			});
			assert.lengthOf(parsed.patches, 2);
		}),
	);
});
