import { assert, describe, it } from "@effect/vitest";
import { MemoryFileSystem } from "@effected/memfs";
import { Effect } from "effect";
import { CLAUDE_CODE, COPILOT } from "../../src/marketplaces.js";
import { applyPatches, readManifest } from "../../src/services/ManifestEditor.js";

const SHA0 = "0".repeat(40);
const SHA1 = "1".repeat(40);

// Spelled out rather than read off the descriptors, so the expected records
// pin the fixed manifest paths instead of echoing whatever the code uses.
const PATHS = { "claude-code": ".claude-plugin/marketplace.json", copilot: ".github/plugin/marketplace.json" } as const;

/** The one change record a `sha` repin of `p1` in `marketplace` produces. */
const shaRecord = (marketplace: keyof typeof PATHS, value: string) => ({
	marketplace,
	path: PATHS[marketplace],
	pluginName: "p1",
	manifestName: "acme",
	field: "sha" as const,
	value,
});

const MANIFEST = `{
	// marketplace
	"name": "acme",
	"plugins": [
		{ "name": "p1", "source": { "source": "git-subdir", "url": "https://github.com/acme/p1", "path": "plugin", "sha": "${SHA0}" } }
	]
}
`;

describe("applyPatches", () => {
	it.effect("updates only the provided field and preserves the comment", () =>
		Effect.gen(function* () {
			const result = yield* applyPatches(CLAUDE_CODE, MANIFEST, [{ name: "p1", sha: SHA1 }]);
			assert.isTrue(result.changed);
			assert.strictEqual(result.manifestName, "acme");
			assert.include(result.editedText, SHA1);
			assert.include(result.editedText, "// marketplace");
			assert.include(result.editedText, '"path": "plugin"');
			assert.deepStrictEqual(result.changes, [shaRecord("claude-code", SHA1)]);
		}),
	);

	it.effect("is a no-op when the value is unchanged", () =>
		Effect.gen(function* () {
			const result = yield* applyPatches(CLAUDE_CODE, MANIFEST, [{ name: "p1", sha: SHA0 }]);
			assert.isFalse(result.changed);
			assert.strictEqual(result.editedText, MANIFEST);
			assert.deepStrictEqual(result.changes, []);
		}),
	);

	it.effect("last-write-wins when two patches target the same plugin+field", () =>
		Effect.gen(function* () {
			// Original sha is 40×"0". Patch 1 sets it to 40×"1" (applied), patch 2 sets
			// it back to 40×"0" (the original value). With the bug, patch 2's
			// "unchanged?" check reads the never-updated original parse, sees
			// "0" === "0", and incorrectly skips — leaving the wrong 40×"1" in the
			// text. Fixed, patch 2 sees the RUNNING state (40×"1") and correctly
			// applies, restoring 40×"0" — which round-trips back to the exact
			// original bytes.
			const result = yield* applyPatches(CLAUDE_CODE, MANIFEST, [
				{ name: "p1", sha: SHA1 },
				{ name: "p1", sha: SHA0 },
			]);
			assert.include(result.editedText, `"sha": "${SHA0}"`);
			assert.notInclude(result.editedText, SHA1);
			assert.strictEqual(result.editedText, MANIFEST);
			assert.isFalse(result.changed);
			// changes is self-consistent with changed: a byte-stable result never
			// carries the transient intermediate writes that netted out to nothing.
			assert.deepStrictEqual(result.changes, []);
		}),
	);

	it.effect("does not record a duplicate edit for two identical-value patches", () =>
		Effect.gen(function* () {
			const result = yield* applyPatches(CLAUDE_CODE, MANIFEST, [
				{ name: "p1", sha: SHA1 },
				{ name: "p1", sha: SHA1 },
			]);
			assert.isTrue(result.changed);
			assert.include(result.editedText, `"sha": "${SHA1}"`);
			assert.deepStrictEqual(result.changes, [shaRecord("claude-code", SHA1)]);
		}),
	);

	it.effect("fails with PluginNotFoundError for an unknown plugin", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(applyPatches(CLAUDE_CODE, MANIFEST, [{ name: "ghost", sha: SHA1 }]));
			if (error._tag !== "PluginNotFoundError") {
				return assert.fail(error._tag);
			}
			assert.strictEqual(error.marketplace, "claude-code");
			assert.strictEqual(error.path, CLAUDE_CODE.path);
		}),
	);

	it.effect("fails with ManifestValidationError for a JSONC-valid but structurally-invalid manifest", () =>
		Effect.gen(function* () {
			const INVALID_MANIFEST = `{
	"name": "acme",
	"plugins": [
		{ "source": { "source": "git-subdir", "url": "https://github.com/acme/p1", "path": "plugin", "sha": "${SHA0}" } }
	]
}
`;
			const error = yield* Effect.flip(applyPatches(CLAUDE_CODE, INVALID_MANIFEST, [{ name: "p1", sha: SHA1 }]));
			assert.strictEqual(error._tag, "ManifestValidationError");
		}),
	);
});

const COPILOT_MANIFEST = `{
	// copilot marketplace
	"name": "acme",
	"owner": { "name": "Acme" },
	"plugins": [
		{
			"name": "p1",
			"source": {
				"source": "github",
				"repo": "acme/p1",
				"path": "plugins/copilot"
			}
		},
		{ "name": "p2", "source": { "source": "github", "repo": "acme/p2", "sha": "${SHA0}" } },
		{ "name": "p3", "source": "plugins/p3" }
	]
}
`;

describe("applyPatches (copilot)", () => {
	it.effect("adds a sha to an entry that has none, preserving comments and layout", () =>
		Effect.gen(function* () {
			const result = yield* applyPatches(COPILOT, COPILOT_MANIFEST, [{ name: "p1", sha: SHA1 }]);
			assert.isTrue(result.changed);
			assert.include(result.editedText, "// copilot marketplace");
			assert.include(result.editedText, `"sha": "${SHA1}"`);
			assert.include(result.editedText, '\t\t\t\t"repo": "acme/p1",');
			assert.deepStrictEqual(result.changes, [shaRecord("copilot", SHA1)]);
		}),
	);

	it.effect("replaces an existing sha and edits path", () =>
		Effect.gen(function* () {
			const result = yield* applyPatches(COPILOT, COPILOT_MANIFEST, [
				{ name: "p2", sha: "2".repeat(40), path: "plugins/p2" },
			]);
			assert.isTrue(result.changed);
			assert.notInclude(result.editedText, SHA0);
			assert.include(result.editedText, `"sha": "${"2".repeat(40)}"`);
			assert.include(result.editedText, '"path": "plugins/p2"');
			assert.deepStrictEqual(
				result.changes.map((c) => c.field),
				["path", "sha"],
			);
		}),
	);

	it.effect("fails with PluginNotFoundError naming the copilot manifest", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(applyPatches(COPILOT, COPILOT_MANIFEST, [{ name: "ghost", sha: SHA1 }]));
			if (error._tag !== "PluginNotFoundError") {
				return assert.fail(error._tag);
			}
			assert.strictEqual(error.marketplace, "copilot");
			assert.strictEqual(error.path, ".github/plugin/marketplace.json");
		}),
	);

	// p3's source is a bare path string — structurally valid, but not
	// pinnable: there is no `source.<field>` to write a sha or path into.
	// This must fail readably, naming the marketplace/manifest/plugin, rather
	// than as a JsoncModifier path-only error.
	it.effect("fails with a readable ManifestValidationError for a bare-string source", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(applyPatches(COPILOT, COPILOT_MANIFEST, [{ name: "p3", sha: SHA1 }]));
			if (error._tag !== "ManifestValidationError") {
				return assert.fail(error._tag);
			}
			assert.strictEqual(error.marketplace, "copilot");
			assert.strictEqual(error.path, COPILOT.path);
			assert.include(error.errors, 'p3: source.source must be "github"');
		}),
	);
});

describe("readManifest", () => {
	it.effect("reads the marketplace's fixed path", () =>
		Effect.gen(function* () {
			// memfs resolves a relative path from its root, as the action's
			// relative manifest paths resolve from the checkout.
			const text = yield* readManifest(COPILOT).pipe(
				Effect.provide(MemoryFileSystem.layerWith({ [PATHS.copilot]: COPILOT_MANIFEST })),
			);
			assert.strictEqual(text, COPILOT_MANIFEST);
		}),
	);

	it.effect("fails with ManifestNotFoundError when the file is missing", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(readManifest(COPILOT).pipe(Effect.provide(MemoryFileSystem.layer)));
			assert.strictEqual(error._tag, "ManifestNotFoundError");
		}),
	);
});
