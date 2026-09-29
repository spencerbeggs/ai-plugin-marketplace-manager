---
type: DataModel
title: Effect Schemas
description: The Effect Schema sources that generate the versioned JSON Schema documents under schemas/, the hosted identities that derive their URLs, and the schemastore CLI walk that keeps them current.
resource: ../../src/schema
status: stable
generated:
  by: okfit/claude-code
  at: 2026-09-29T03:16:59Z
  body_sha256: cf9116dc6ac950e54b76a1bc4744f5f25edccfe525b0cda3bf0d6e6f7037c0fb
sources:
  - id: input-schema
    resource: ../../src/schema/input.ts
    title: "the hosted identities, version labels, and JsonInput"
  - id: marketplaces
    resource: ../../src/marketplaces.ts
    title: "the per-marketplace Marketplace descriptors and their compiled ajv validators"
  - id: schemastore-config
    resource: ../../lib/scripts/schemastore.config.ts
    title: "the schemastore CLI target manifest"
  - id: schemastore-types
    resource: npm:@effected/schemastore
    title: "StoreDocumentOptions.jsonSchema in index.d.ts — the closed-object default"
tags:
  - architecture
  - testing
---

# Effect Schemas

## Effect Schema is the single source of truth

Four JSON Schema files exist in this repository, and they play three
different roles:

| File | Origin | Role |
| --- | --- | --- |
| `schemas/2.0/output.json` | Generated from `ReportOutput` (`src/schema/report-output.ts`) | The `result` output's published contract; every payload carries its URL as `$schema`. |
| `schemas/2.0/input.json` | Generated from `JsonInput` (`src/schema/input.ts`) | The `json` input's published contract, for editor completion and structured-output validators. |
| `src/schema/claude-code-marketplace.json` | Vendored SchemaStore asset (65KB, not generated) | Structural validation of the edited Claude Code manifest, compiled by ajv in `src/marketplaces.ts`'s `CLAUDE_CODE` descriptor. |
| `src/schema/copilot-marketplace.json` | Hand-authored (no published SchemaStore document exists for Copilot's `marketplace.json`) | Structural validation of the edited Copilot manifest, compiled by the same ajv instance in `src/marketplaces.ts`'s `COPILOT` descriptor.[^marketplaces] Covers the documented required fields (`name`, `owner.name`, `plugins[].{name,source}`) and is permissive about everything else. |

The two generated documents are never hand-edited. Their content comes from
the Effect Schemas; their location and `$id` come from a `HostedSchema`
identity; and `@effected/schemastore-cli` is what turns the one into the
other. The two structural manifest schemas are JSON Schema, not Effect
Schema, because each validates a third-party document this action does not
own — see [ajv-strict-false](../decisions/ajv-strict-false.md).

## The identity is constructed once, carried across the rename

`src/schema/input.ts`[^input-schema] owns every fact about where a generated
document lives:

- `OUTPUT_SCHEMA_VERSION = "2.0"` — the label both documents are currently
  published under, and the one constant a contract break moves.
- `OUTPUT_SCHEMA_VERSIONS` — every label the CLI **tracks**, oldest first,
  with the current one newest; today `["1.0", "2.0"]`. `1.0` is a frozen
  label: the CLI checks the file exists and declares its derived `$id`, but
  never regenerates it. The repository was renamed
  `claude-code-marketplace-manager` → `ai-plugin-marketplace-manager` at v2,
  and the CLI derives every tracked label's `$id` from the *current* repo
  name — so `schemas/1.0/output.json` and `schemas/1.0/input.json` had their
  `$id` (line 3 of each) rewritten by hand to the new repo name at the
  rename, the one edit a frozen file ever takes, keeping `1.0` tracked and
  drift-checked rather than dropped from the list. `schemas/1.0/output.json`
  line 69's `$schema` enum value deliberately still names the *old* repo
  URL: v1 payloads emit that URL, and GitHub's rename redirect resolves it.
  See
  [repository-renamed-1-0-schema-ids-rewritten](../decisions/repository-renamed-1-0-schema-ids-rewritten.md).
- A `hosted(name)` helper calling `HostedSchema.github({ repo:
  "spencerbeggs/ai-plugin-marketplace-manager", path: "schemas", name,
  versions, current, appendVersion: false })` — the directory carries the
  label, so the file name does not repeat it.
- `OutputSchemaIdentity = hosted("output")` and
  `InputSchemaIdentity = hosted("input")`.

The URLs the code emits are those identities' `$id` getters, not string
literals: `INPUT_SCHEMA_URL: string = InputSchemaIdentity.$id`
(`src/schema/input.ts`) and `SCHEMA_URL: string = OutputSchemaIdentity.$id`
(`src/schema/report-output.ts`). Because `SCHEMA_URL` is a `string` rather
than a literal type, `ReportOutput`'s `$schema` field decodes as `string`;
runtime decoding still rejects any other value. **`ReportOutput` no longer
carries an in-band `SCHEMA_VERSION`/`schemaVersion` field at all** — see
[url-and-schema-version-dropped](../decisions/url-and-schema-version-dropped.md).

## The v2 patch schema

`PluginPatch` (`src/schema/input.ts`) gained `marketplace: MarketplaceId`
(`Schema.Literals(["claude-code", "copilot"])`) and made `sha` required
(40-hex lowercase); `url` was removed entirely. `JsonInput.plugins` is
`Schema.Array(PluginPatch).check(Schema.isMinLength(1))`, not
`Schema.NonEmptyArray` — see
[nonemptyarray-blocked-in-published-schemas](../gotchas/nonemptyarray-blocked-in-published-schemas.md).
`decodeJsonInput` decodes with `onExcessProperty: "error"`, so a stray key
(a v1 payload's `url` above all) fails the decode rather than being
silently stripped.

## What is derived from it

`lib/scripts/schemastore.config.ts`[^schemastore-config] is the
`@effected/schemastore-cli` target manifest: a `defineConfig` with the
required config `name` (`"ai-plugin-marketplace-manager"`, the base name of
its catalog slice — none is written, since no entry declares a `catalog`
block), `outputDir: "../../schemas"` (relative to the config file, not the
repo root) and one entry per document, keyed by the identity's `name` and handed
the identity as `hosted`. `defineConfig` rejects an entry keyed differently
from its identity, so the `$id` the CLI writes and the `$schema` a payload
carries are one derivation, not two that must agree. The config lives under
`lib/scripts/` because `src/` is action source only, so the package scripts
pass its path explicitly instead of relying on the CLI's upward discovery.

Both entries are `published: false`, because the `2.0` documents have not
been published yet, so a contract change regenerates the file in place
instead of demanding a bump. Once an entry is `published: true`, a
contract-class change at that label is answered by bumping
`OUTPUT_SCHEMA_VERSION` and keeping the old label in `OUTPUT_SCHEMA_VERSIONS`
as a frozen file — see
[bump-the-output-schema-version](../runbooks/bump-the-output-schema-version.md)
and
[versioned-schema-documents](../decisions/versioned-schema-documents.md).

Every object in both documents is emitted closed
(`additionalProperties: false`). That is the library's own default —
`StoreDocumentOptions.jsonSchema` documents `onExcessProperty` as defaulting
to `"error"` because a published document is a contract, where core's
`Schema.toJsonSchemaDocument` default has been `"ignore"` (open) since
rc.113[^schemastore-types]. The config passes no `jsonSchema` option, so
nothing here has to remember to close them. The runtime decoders in
`src/schema/` keep core's `"ignore"` default and tolerate excess keys
(`decodeJsonInput` overrides this to `"error"` specifically, as noted
above); the published documents are deliberately the stricter default.

## The commands

- `pnpm schema:build` — `schemastore build lib/scripts/schemastore.config.ts`:
  lints each document, runs the ajv strict-mode gate, applies the drift
  policy, and writes only the documents whose content actually changed.
  Wired as the turbo `schema:build` task, which depends on `types:check`,
  outputs `schemas/**`, and is a dependency of `build:prod`.
- `pnpm schema:check` — the identical walk with no writes. It reports each
  document as unchanged, would-write, or drift, and exits non-zero when a
  build would write or refuse anything. `pnpm ci:test` runs it before
  vitest, so it — not a vitest test — is the drift guard in CI.
  `schemas/1.0/` is a frozen label inside `OUTPUT_SCHEMA_VERSIONS`, so the
  walk verifies its file exists and declares its derived `$id` but never
  regenerates it.

## What breaks if an entry is wrong

- An Effect Schema change without `pnpm schema:build` leaves a stale
  document on disk; `pnpm schema:check` fails `ci:test`.
- A hand edit to `schemas/2.0/*.json` is drift in the other direction and
  fails the same check; the CLI compares by content, so a formatter reflow
  alone does not.
- A label bump that misses the prose — `action.yml`'s `result` description
  and the README's example `$schema` and document links — fails nothing in
  the CLI, which is why `__test__/action-contract.test.ts`'s third leg pins
  that prose to `SCHEMA_URL`, `INPUT_SCHEMA_URL`, and each identity's
  `fileName`; see [action-contract](action-contract.md).
- A label listed in `OUTPUT_SCHEMA_VERSIONS` with no file on disk, or a
  frozen file whose `$id` no longer matches the derived one, fails the CLI's
  pre-flight before anything is written — which is why the rename required
  rewriting `schemas/1.0/`'s committed `$id`s rather than leaving `1.0`
  tracked with stale ones.
- `Schema.NonEmptyArray` in place of `Schema.Array(...).check(Schema.isMinLength(1))`
  on a published document fails the ajv strict-mode gate in `schema:build`
  (spencerbeggs/effected#818) rather than at decode time — see
  [nonemptyarray-blocked-in-published-schemas](../gotchas/nonemptyarray-blocked-in-published-schemas.md).

[^input-schema]: `../../src/schema/input.ts`
[^marketplaces]: `../../src/marketplaces.ts`
[^schemastore-config]: `../../lib/scripts/schemastore.config.ts`
[^schemastore-types]: `npm:@effected/schemastore` (0.17.0, `index.d.ts`)
