import type { JsoncModificationError, JsoncParseError, JsoncStringifyError } from "@effected/jsonc";
import { Jsonc, JsoncEdit, JsoncModifier } from "@effected/jsonc";
import { Effect, FileSystem } from "effect";
import { ManifestNotFoundError, ManifestValidationError, PluginNotFoundError } from "../errors/errors.js";
import type { Marketplace } from "../marketplaces.js";
import type { ChangeRecord } from "../schema/marketplace.js";
import { decodeMarketplace } from "../schema/marketplace.js";

/**
 * The fields of a patch the editor applies. Structural rather than
 * `PluginPatch` so the editor does not depend on the input envelope — a
 * `PluginPatch` (which also carries `marketplace`) is assignable to it.
 */
export interface EntryPatch {
	readonly name: string;
	readonly sha: string;
	readonly path?: string;
}

/** Fields shared by both {@link EditResult} variants. */
interface EditResultBase {
	readonly original: string;
	readonly editedText: string;
	readonly manifestName: string;
}

/** A byte-stable edit: nothing to validate, nothing to land. */
export interface NoopEdit extends EditResultBase {
	readonly changed: false;
	/** Always empty — a byte-stable result records no changes. */
	readonly changes: readonly [];
}

/** An edit that actually changed the manifest text. */
export interface ChangedEdit extends EditResultBase {
	readonly changed: true;
	readonly changes: ReadonlyArray<ChangeRecord>;
}

/**
 * Outcome of applying patches to the manifest text. Discriminated on `changed`,
 * so narrowing past the no-op guard yields a {@link ChangedEdit} — the only
 * thing `ManifestValidator.validateEdit` accepts, which is what keeps a
 * byte-stable no-op from reaching validation or a commit.
 */
export type EditResult = NoopEdit | ChangedEdit;

const FIELDS = ["path", "sha"] as const;

/** Read the current `source.<field>` value from the parsed manifest, if present. */
const currentValue = (parsed: unknown, index: number, field: "path" | "sha"): string | undefined => {
	const plugins = (parsed as { plugins?: Array<{ source?: Record<string, unknown> }> }).plugins;
	const source = plugins?.[index]?.source;
	const value = source?.[field];
	return typeof value === "string" ? value : undefined;
};

/** Read the current `source` value for a plugin, unnarrowed. */
const currentSource = (parsed: unknown, index: number): unknown =>
	(parsed as { plugins?: Array<{ source?: unknown }> }).plugins?.[index]?.source;

/**
 * Apply patches to marketplace `m`'s manifest text, format-preservingly. Only
 * provided fields whose value actually differs are written. Returns the edited
 * text, whether anything changed, the manifest `name`, and the change records.
 *
 * @remarks
 * A field absent from the entry's `source` is inserted — this is how an
 * unpinned entry gets its first `sha`.
 */
export const applyPatches = (
	m: Marketplace,
	text: string,
	patches: ReadonlyArray<EntryPatch>,
): Effect.Effect<
	EditResult,
	PluginNotFoundError | JsoncParseError | JsoncModificationError | JsoncStringifyError | ManifestValidationError
> =>
	Effect.gen(function* () {
		let parsed = yield* Jsonc.parse(text);
		const manifest = yield* decodeMarketplace(parsed).pipe(
			Effect.mapError(
				(e) =>
					new ManifestValidationError({
						marketplace: m.id,
						path: m.path,
						errors: [`${m.path} is not a valid marketplace manifest: ${String(e)}`],
					}),
			),
		);
		const manifestName = manifest.name;
		const names = manifest.plugins.map((p) => p.name);

		let currentText = text;
		const changes: Array<ChangeRecord> = [];

		for (const patch of patches) {
			const index = names.indexOf(patch.name);
			if (index === -1) {
				return yield* Effect.fail(new PluginNotFoundError({ marketplace: m.id, path: m.path, name: patch.name }));
			}
			// A bare-string `source` (Copilot's unpinnable shorthand form) is
			// structurally valid but has no `source.<field>` to write into.
			// Without this check, `JsoncModifier.modify` would fail with a
			// path-only `JsoncModificationError` naming neither the marketplace,
			// the manifest nor the plugin. Reuse the descriptor's `sourceErrors`
			// so the message matches what `validateEdit` would report for the
			// same entry — object sources never trip this, so `modify` below
			// still owns every other `JsoncModificationError`.
			const source = currentSource(parsed, index);
			if (typeof source !== "object" || source === null || Array.isArray(source)) {
				return yield* Effect.fail(
					new ManifestValidationError({
						marketplace: m.id,
						path: m.path,
						errors: [...m.sourceErrors(patch.name, source)],
					}),
				);
			}
			for (const field of FIELDS) {
				const next = patch[field];
				if (next === undefined) {
					continue;
				}
				if (currentValue(parsed, index, field) === next) {
					continue; // unchanged — skip
				}
				const edits = yield* JsoncModifier.modify(currentText, ["plugins", index, "source", field], next);
				currentText = JsoncEdit.applyAll(currentText, edits);
				parsed = yield* Jsonc.parse(currentText);
				changes.push({ marketplace: m.id, path: m.path, pluginName: patch.name, manifestName, field, value: next });
			}
		}

		// `changes` is kept self-consistent with `changed` by the union itself:
		// NoopEdit types `changes` as `readonly []`, so a byte-stable result cannot
		// carry the transient per-write records that netted out to nothing.
		if (currentText === text) {
			return { original: text, editedText: currentText, changed: false, manifestName, changes: [] } satisfies NoopEdit;
		}
		return { original: text, editedText: currentText, changed: true, manifestName, changes } satisfies ChangedEdit;
	});

/**
 * Read marketplace `m`'s manifest from the checkout.
 *
 * @remarks
 * Only manifests some patch targets are read, so a missing file is always a
 * caller error — surfaced as {@link ManifestNotFoundError} naming the
 * marketplace, rather than a bare platform error naming only a path.
 */
export const readManifest = (m: Marketplace) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		if (!(yield* fs.exists(m.path))) {
			return yield* Effect.fail(new ManifestNotFoundError({ marketplace: m.id, path: m.path }));
		}
		return yield* fs.readFileString(m.path);
	});
