/**
 * The `schemastore` CLI config: the two action JSON Schema documents, derived
 * from their Effect Schema sources.
 *
 * @remarks
 * Lives under `lib/scripts/` (`src/` is action source only), so the
 * package.json scripts hand the CLI this path explicitly instead of relying
 * on its upward `schemastore.config.*` discovery.
 *
 * `src/schema/report-output.ts` (`ReportOutput` — the action's structured
 * `result` output) and `src/schema/input.ts` (`JsonInput` — the `json` input's
 * per-plugin patch envelope) are the single sources of truth. Everything else
 * — Draft-07 lowering, the structural lint, the ajv strict-mode gate, the
 * drift policy and the content-comparing write — belongs to
 * `@effected/schemastore` and its CLI.
 *
 * Each entry's identity — base URL, version labels, layout — is the
 * `HostedSchema` value `src/schema/input.ts` constructs once
 * (`OutputSchemaIdentity` / `InputSchemaIdentity`), handed over as `hosted`.
 * The `$schema` URL the code emits (`SCHEMA_URL`, `INPUT_SCHEMA_URL`) is that
 * same value's `$id`, so the URL a payload carries and the `$id` the CLI writes
 * are one derivation, not two that have to agree. Both documents are
 * **versioned** at `OUTPUT_SCHEMA_VERSION` under
 * `schemas/<version>/<name>.json`:
 *
 * - `output` (`ReportOutput`) — every payload the action emits carries its
 *   URL as `$schema`, so an old payload must keep resolving to the shape it
 *   was written against.
 * - `input` (`JsonInput`) — the `$schema` a `json` input document references
 *   for editor completion.
 *
 * Every object is generated closed (`additionalProperties: false`) — the
 * library's default — which is the contract consumers hold; the decoders in
 * `src/schema/` keep core's `"ignore"` default and tolerate excess keys, so
 * the published documents are deliberately the stricter of the two.
 *
 * `pnpm schema:build` writes; `pnpm schema:check` is the same walk with no
 * writes and is the CI gate (it fails when a build would write anything).
 *
 * Bumping the version is one constant (`OUTPUT_SCHEMA_VERSION`) plus, once a
 * label has shipped, keeping the old label in `OUTPUT_SCHEMA_VERSIONS` as a
 * frozen file.
 */

import { defineConfig } from "@effected/schemastore";
import { InputSchemaIdentity, JsonInput, OutputSchemaIdentity } from "../../src/schema/input.js";
import { ReportOutput } from "../../src/schema/report-output.js";

export default defineConfig({
	// Relative paths resolve against this file's directory, not the repo root.
	outputDir: "../../schemas",
	schemas: {
		[OutputSchemaIdentity.name]: {
			schema: ReportOutput,
			hosted: OutputSchemaIdentity,
			// A single label until one is published: a second label is appended
			// only once the first has shipped and its file is frozen on disk.
			// `published: false` (the default) lets a contract change at this label
			// regenerate the file in place instead of demanding a bump.
			published: false,
		},
		[InputSchemaIdentity.name]: {
			schema: JsonInput,
			hosted: InputSchemaIdentity,
			published: false,
		},
	},
});
