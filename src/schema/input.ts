import { HostedSchema } from "@effected/schemastore";
import { Schema } from "effect";

/**
 * The version label every generated document is currently published under
 * (`schemas/<version>/`). The one constant a contract break moves.
 *
 * @remarks
 * Independent of the action's own version and of `ReportOutput`'s in-band
 * `schemaVersion` field: this label names the hosted **document**, while
 * `SCHEMA_VERSION` is the value a payload carries in-band.
 */
export const OUTPUT_SCHEMA_VERSION = "1.0";

/**
 * Every label the documents have been published under, oldest first; the
 * current one is the newest. Older labels are frozen: the CLI verifies each
 * file still exists and declares its derived `$id`, but never regenerates it.
 */
export const OUTPUT_SCHEMA_VERSIONS: ReadonlyArray<string> = [OUTPUT_SCHEMA_VERSION];

/**
 * Where a generated JSON Schema document is hosted: raw from this repository's
 * `main` branch under `schemas/`, versioned as `schemas/<version>/<name>.json`
 * — the directory carries the label, so the file name does not repeat it.
 *
 * @remarks
 * Constructed once here and handed to `lib/scripts/schemastore.config.ts` as
 * each entry's `hosted`, so the `$schema` URL the code emits and the `$id` the
 * CLI writes are one value rather than two derivations that have to agree.
 */
const hosted = (name: string): HostedSchema =>
	HostedSchema.github({
		repo: "spencerbeggs/claude-code-marketplace-manager",
		path: "schemas",
		name,
		versions: OUTPUT_SCHEMA_VERSIONS,
		current: OUTPUT_SCHEMA_VERSION,
		appendVersion: false,
	});

/** Hosted identity of the `result` output document (`ReportOutput`). */
export const OutputSchemaIdentity: HostedSchema = hosted("output");

/** Hosted identity of the `json` input document (`JsonInput`). */
export const InputSchemaIdentity: HostedSchema = hosted("input");

/**
 * Hosted JSON Schema URL for the `json` input contract; the `$id` of the
 * generated document.
 */
export const INPUT_SCHEMA_URL: string = InputSchemaIdentity.$id;

/**
 * A single per-plugin partial-merge patch: names an existing plugin and changes
 * only the fields present.
 */
/** Lowercase 40-hex commit SHA, matching `ManifestValidator`'s `SHA_RE`. */
const SHA_PATTERN = /^[0-9a-f]{40}$/;

export const PluginPatch = Schema.Struct({
	name: Schema.String.annotate({ description: "Name of an existing plugin to update." }),
	url: Schema.optionalKey(Schema.String).annotate({ description: "New source.url." }),
	path: Schema.optionalKey(Schema.String).annotate({ description: "New source.path." }),
	sha: Schema.optionalKey(Schema.String.check(Schema.isPattern(SHA_PATTERN))).annotate({
		description: "New source.sha (40-hex lowercase commit).",
	}),
}).annotate({ identifier: "PluginPatch" });

/** Decoded patch type. */
export type PluginPatch = typeof PluginPatch.Type;

/**
 * The `json` input: an object envelope carrying the per-plugin patches.
 *
 * @remarks
 * A top-level object (rather than a bare array) so this schema is usable as-is
 * by tool-calling / structured-output validators that require an object root.
 * The `plugins` key mirrors `marketplace.json`'s own top-level `plugins` array,
 * leaving room to add sibling keys later without a shape-breaking change.
 */
export const JsonInput = Schema.Struct({
	plugins: Schema.Array(PluginPatch).annotate({ description: "Per-plugin partial-merge patches." }),
}).annotate({ identifier: "MarketplacePatchInput" });

/** Decoded `json` input type. */
export type JsonInput = typeof JsonInput.Type;

/** Decode an already-parsed JS value into the `json` input envelope. */
export const decodeJsonInput = Schema.decodeUnknownEffect(JsonInput);
