import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assert, it as effectIt } from "@effect/vitest";
import { GitBranch, GitCommit, GitHubRepository, PullRequest, Repo, RepoRef } from "@effected/github";
import { ActionEnvironment, ActionInput, ActionManifest, ActionOutputs, ActionState } from "@effected/github-actions";
import { MemoryFileSystem } from "@effected/memfs";
import { ConfigProvider, Effect, Layer, Result } from "effect";
import { describe, expect, it } from "vitest";
import { INPUT_DEFAULTS, INPUT_NAMES, OUTPUT_NAMES } from "../src/contract.js";
import { parseInputs } from "../src/inputs.js";
import { readAppCredentials } from "../src/pre.js";
import { program } from "../src/program.js";
import { INPUT_SCHEMA_URL, InputSchemaIdentity, OutputSchemaIdentity } from "../src/schema/input.js";
import { SCHEMA_URL } from "../src/schema/report-output.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (rel: string): string => readFileSync(resolve(REPO_ROOT, rel), "utf8");

const manifest = (() => {
	const decoded = ActionManifest.decodeResult(read("action.yml"));
	if (Result.isFailure(decoded)) {
		throw new Error(`action.yml did not decode: ${String(decoded.failure)}`);
	}
	return decoded.success;
})();
const declaredInputs = manifest.inputs ?? {};
const declaredOutputs = manifest.outputs ?? {};

const SHA = "a".repeat(40);

/**
 * The input names the code reads, recorded rather than scanned from source.
 *
 * @remarks
 * `ActionInput.recording` journals every `INPUT_` lookup as it runs, so this
 * sees a read only on the path the run takes. Hence the manual-path inputs:
 * `parseInputs` reads all five patch fields up front, and a valid manual patch
 * carries it past every later read. `pre`'s two credential reads run through
 * `readAppCredentials`, the same effect `pre` yields.
 */
const recordInputReads = Effect.gen(function* () {
	const recording = ActionInput.recording(
		ActionManifest.runnerInputs(manifest, {
			name: "p1",
			marketplace: "claude-code",
			sha: SHA,
			"app-client-id": "1",
			"app-private-key": "key",
		}),
	);
	yield* parseInputs.pipe(Effect.provide(recording.layer));
	yield* readAppCredentials.pipe(Effect.provide(recording.layer));
	return yield* recording.names;
});

/**
 * The output names the code writes, recorded through `ActionOutputs.recording`.
 *
 * @remarks
 * Runs `program` with no inputs at all: the XOR check fails first, and the
 * failure path emits the full output set through the same `emit` the success
 * path uses. Every other service is a bare `layerTest()` double that dies if
 * reached, so the run touches nothing but the outputs.
 */
const recordOutputWrites = Effect.gen(function* () {
	const outputs = ActionOutputs.recording();
	yield* program.pipe(
		Effect.exit,
		Effect.provide(
			Layer.mergeAll(
				outputs.layer,
				ActionState.layerTest(),
				GitCommit.layerTest(),
				GitBranch.layerTest(),
				PullRequest.layerTest(),
				GitHubRepository.layerTest(),
				Layer.succeed(Repo, RepoRef.make({ owner: "o", repo: "r" })),
				ActionEnvironment.layerTest(),
				MemoryFileSystem.layer,
			),
		),
		Effect.provide(ConfigProvider.layer(ActionInput.provider({}))),
	);
	return outputs.entries().flatMap((e) => (e.name === undefined ? [] : [e.name]));
});

describe("action contract", () => {
	// Leg 1: action.yml <-> contract.ts. Catches an input added to the manifest
	// but never declared here, and a name dropped from the manifest that the
	// code still believes in.
	describe("action.yml agrees with the declared contract", () => {
		it("declares exactly the inputs in INPUT_NAMES", () => {
			expect(Object.keys(declaredInputs).sort()).toEqual([...INPUT_NAMES].sort());
		});

		it("declares exactly the outputs in OUTPUT_NAMES", () => {
			expect(Object.keys(declaredOutputs).sort()).toEqual([...OUTPUT_NAMES].sort());
		});

		it("gives every mirrored input the default the contract states", () => {
			const fromManifest = Object.fromEntries(
				Object.keys(INPUT_DEFAULTS).map((name) => [name, declaredInputs[name]?.default]),
			);
			expect(fromManifest).toEqual({ ...INPUT_DEFAULTS });
		});

		it("leaves every other optional input defaulting to the empty string", () => {
			// Guards the reasoning INPUT_DEFAULTS is built on: inputs.ts maps "" to
			// "missing", so an unmirrored input quietly acquiring a real default
			// would change behavior with nothing here to notice.
			const mirrored = new Set<string>(Object.keys(INPUT_DEFAULTS));
			const required = new Set(["app-client-id", "app-private-key"]);
			for (const [name, decl] of Object.entries(declaredInputs)) {
				if (mirrored.has(name) || required.has(name)) continue;
				expect(decl.default, `input "${name}" has an unmirrored non-empty default`).toBe("");
			}
		});
	});

	// Leg 2: action.yml <-> the code. Catches the rename that lands in the
	// manifest and the contract but misses the call site — the failure mode with
	// no compile error and no runtime error, just an input silently defaulting.
	describe("the code reads and writes exactly the declared names", () => {
		effectIt.effect("reads every declared input and nothing undeclared", () =>
			Effect.gen(function* () {
				const diff = ActionManifest.diff(manifest, { inputs: yield* recordInputReads });
				assert.deepStrictEqual(diff.unreadInputs, []);
				assert.deepStrictEqual(diff.undeclaredInputs, []);
			}),
		);

		// `result` needs no special case: `setJson` records under its name too.
		effectIt.effect("writes every declared output and nothing undeclared", () =>
			Effect.gen(function* () {
				const diff = ActionManifest.diff(manifest, { inputs: INPUT_NAMES, outputs: yield* recordOutputWrites });
				assert.deepStrictEqual(diff.unwrittenOutputs, []);
				assert.deepStrictEqual(diff.undeclaredOutputs, []);
			}),
		);
	});

	// Leg 3: the hosted schema URLs <-> the prose that quotes them. The code and
	// the generated documents share one derivation (`HostedSchema.$id`, checked
	// by `pnpm schema:check`), but action.yml and the README spell the URL and
	// the file paths by hand, and a version bump that misses them fails nothing.
	describe("the documentation quotes the derived schema locations", () => {
		const readme = read("README.md");

		it("action.yml points the result output at SCHEMA_URL", () => {
			expect(declaredOutputs.result?.description).toContain(SCHEMA_URL);
		});

		it("README quotes SCHEMA_URL as the example $schema", () => {
			expect(readme).toContain(`"$schema": "${SCHEMA_URL}"`);
		});

		it("README links the committed documents at their generated paths", () => {
			expect(readme).toContain(`(schemas/${OutputSchemaIdentity.fileName})`);
			expect(readme).toContain(`(schemas/${InputSchemaIdentity.fileName})`);
		});

		it("derives both URLs from the versioned layout", () => {
			expect(SCHEMA_URL).toBe(
				"https://raw.githubusercontent.com/spencerbeggs/ai-plugin-marketplace-manager/main/schemas/2.0/output.json",
			);
			expect(INPUT_SCHEMA_URL).toBe(
				"https://raw.githubusercontent.com/spencerbeggs/ai-plugin-marketplace-manager/main/schemas/2.0/input.json",
			);
		});
	});
});
