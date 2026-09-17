import { Schema } from "effect";
import { OutputSchemaIdentity } from "./input.js";

/**
 * Hosted JSON Schema URL; emitted as the `result`'s `$schema`.
 *
 * @remarks
 * The `$id` of `OutputSchemaIdentity`'s current document — the same value
 * `lib/scripts/schemastore.config.ts` writes as the document's `$id`, so the
 * two cannot disagree. Versioned (`schemas/<version>/output.json`) so a payload
 * keeps resolving to the shape it was written against after the schema moves.
 */
export const SCHEMA_URL: string = OutputSchemaIdentity.$id;

/** In-band schema version; bumped only on a breaking shape change. */
export const SCHEMA_VERSION = "1";

/** Human-facing status derived from the machine booleans. */
export type ResultStatus = "no-op" | "success" | "failed";

const ChangedPlugin = Schema.Struct({
	name: Schema.String,
	fields: Schema.Array(Schema.Literals(["url", "path", "sha"])),
}).annotate({ identifier: "ChangedPlugin" });

const CommitInfo = Schema.Struct({
	sha: Schema.String,
	url: Schema.NullOr(Schema.String),
}).annotate({ identifier: "CommitInfo" });

const PrInfo = Schema.Struct({
	number: Schema.Int,
	url: Schema.NullOr(Schema.String),
}).annotate({ identifier: "PrInfo" });

/**
 * The structured `result` output. Consumers branch on the orthogonal booleans
 * `noop`/`succeeded`/`hasFailures`; `status` is a derived human label.
 */
export const ReportOutput = Schema.Struct({
	// `SCHEMA_URL` is a `string` (a `HostedSchema` getter, not a literal), so the
	// decoded `$schema` is typed `string`; runtime decoding still rejects any
	// other URL.
	$schema: Schema.Literal(SCHEMA_URL),
	schemaVersion: Schema.Literal(SCHEMA_VERSION),
	mode: Schema.Literals(["commit", "pr"]),
	status: Schema.Literals(["no-op", "success", "failed"]),
	noop: Schema.Boolean,
	succeeded: Schema.Boolean,
	hasFailures: Schema.Boolean,
	dryRun: Schema.Boolean,
	pluginsUpdated: Schema.Int,
	plugins: Schema.Array(ChangedPlugin),
	commit: Schema.NullOr(CommitInfo),
	pr: Schema.NullOr(PrInfo),
}).annotate({
	identifier: "MarketplaceManagerResult",
	description:
		"Result of a marketplace-manager run. `noop` true ⇒ nothing changed and no commit/PR. " +
		"`succeeded` true with `noop` false ⇒ the edit landed (or, in dry-run, would have). " +
		"`status` is derived: no-op ⇒ 'no-op', else succeeded ⇒ 'success', else 'failed'.",
});

/** Decoded output type. */
export type ReportOutput = typeof ReportOutput.Type;
