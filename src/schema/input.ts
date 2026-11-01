import { HostedSchema } from "@effected/schemastore";
import { Schema } from "effect";

/**
 * The version label every generated document is currently published under
 * (`schemas/<version>/`). The one constant a contract break moves.
 */
export const OUTPUT_SCHEMA_VERSION = "2.0";

/**
 * Every label the CLI tracks, oldest first; the current one is the newest.
 *
 * @remarks
 * `1.0` is a frozen label: the CLI checks the file exists and declares its
 * derived `$id`, but never regenerates it. The repository was renamed from
 * `claude-code-marketplace-manager` at v2, and the CLI derives every tracked
 * label's `$id` from the *current* repo name, so the two 1.0 files had their
 * `$id` rewritten to the new name by hand at the rename — the one edit a
 * frozen file ever takes. Their `$schema` enum (the URL v1 payloads emit)
 * still names the old repo on purpose: v1 keeps emitting it, and GitHub's
 * rename redirect resolves it.
 */
export const OUTPUT_SCHEMA_VERSIONS: ReadonlyArray<string> = ["1.0", OUTPUT_SCHEMA_VERSION];

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
		repo: "spencerbeggs/ai-plugin-marketplace-manager",
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

/** Lowercase 40-hex commit SHA, matching the validators' `SHA_RE`. */
const SHA_PATTERN = /^[0-9a-f]{40}$/;

/**
 * A non-empty, relative path with no `..` segment, no backslash, and no C0
 * control character (a bare `[^/].*` also accepted a leading `\n`, which lands
 * in the commit body, and `..` segments/backslashes that could escape the
 * intended directory).
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: deliberately rejects C0 control characters (e.g. a `\n` that would land in the commit body) in a caller-supplied path.
const RELATIVE_PATH_PATTERN = /^(?!.*(?:^|\/)\.\.(?:\/|$))[^/\\\x00-\x1f][^\\\x00-\x1f]*$/;

/** The marketplaces a patch can target; each owns one fixed manifest path. */
export const MarketplaceId = Schema.Literals(["claude-code", "copilot"]).annotate({
	description: "Which marketplace manifest the patch targets.",
});

/** Decoded marketplace identifier. */
export type MarketplaceId = typeof MarketplaceId.Type;

/**
 * A single repin: names an existing entry in one marketplace's manifest and
 * sets its `source.sha` (and optionally `source.path`).
 */
export const PluginPatch = Schema.Struct({
	name: Schema.NonEmptyString.annotate({ description: "Name of an existing plugin entry in the target manifest." }),
	marketplace: MarketplaceId,
	sha: Schema.String.check(Schema.isPattern(SHA_PATTERN)).annotate({
		description: "New source.sha (40-hex lowercase commit).",
	}),
	path: Schema.optionalKey(Schema.String.check(Schema.isPattern(RELATIVE_PATH_PATTERN))).annotate({
		description: "New source.path (non-empty, relative).",
	}),
}).annotate({ identifier: "PluginPatch" });

/** Decoded patch type. */
export type PluginPatch = typeof PluginPatch.Type;

/**
 * The `json` input: an object envelope carrying the patches.
 *
 * @remarks
 * A top-level object (rather than a bare array) so this schema is usable as-is
 * by tool-calling / structured-output validators that require an object root.
 */
export const JsonInput = Schema.Struct({
	plugins: Schema.NonEmptyArray(PluginPatch).annotate({ description: "Plugin patches; at least one." }),
}).annotate({ identifier: "MarketplacePatchInput" });

/** Decoded `json` input type. */
export type JsonInput = typeof JsonInput.Type;

/**
 * Decode an already-parsed JS value into the `json` input envelope.
 *
 * @remarks
 * `onExcessProperty: "error"` makes the decoder as strict as the published
 * (closed) document, so a stray key — above all v1's `url` — fails instead of
 * being silently stripped and the rest of the patch applied.
 */
export const decodeJsonInput = Schema.decodeUnknownEffect(JsonInput, { onExcessProperty: "error" });
