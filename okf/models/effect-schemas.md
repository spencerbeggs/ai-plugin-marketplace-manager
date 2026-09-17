---
type: DataModel
title: Effect Schemas
description: The Effect Schema sources that generate the versioned JSON Schema documents under schemas/, the hosted identities that derive their URLs, and the schemastore CLI walk that keeps them current.
resource: ../../src/schema
status: stable
generated:
  by: okfit/claude-code
  at: 2026-09-17T19:20:18Z
  body_sha256: 9734e649bc620d90728c556c1b74ad0bf7c38162627d986278c93e4a5bd6a74d
sources:
  - id: input-schema
    resource: ../../src/schema/input.ts
    title: "the hosted identities, version labels, and JsonInput"
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

Three JSON Schema files exist in this repository, and they play three
different roles:

| File | Origin | Role |
| --- | --- | --- |
| `schemas/1.0/output.json` | Generated from `ReportOutput` (`src/schema/report-output.ts`) | The `result` output's published contract; every payload carries its URL as `$schema`. |
| `schemas/1.0/input.json` | Generated from `JsonInput` (`src/schema/input.ts`) | The `json` input's published contract, for editor completion and structured-output validators. |
| `src/schema/claude-code-marketplace.json` | Vendored SchemaStore asset (65KB, not generated) | Structural validation of the edited manifest, compiled by ajv in `src/services/ManifestValidator.ts:8` (`import marketplaceSchema from "../schema/claude-code-marketplace.json"`). |

The two generated documents are never hand-edited. Their content comes from
the Effect Schemas; their location and `$id` come from a `HostedSchema`
identity; and `@effected/schemastore-cli` is what turns the one into the
other.

## The identity is constructed once

`src/schema/input.ts`[^input-schema] owns every fact about where a generated
document lives:

- `OUTPUT_SCHEMA_VERSION = "1.0"` — the label both documents are currently
  published under, and the one constant a contract break moves
  (`src/schema/input.ts:13`). It is independent of the action's own version
  and of `ReportOutput`'s in-band `SCHEMA_VERSION = "1"`
  (`src/schema/report-output.ts:16`): the label names the hosted
  **document**, the in-band field is what a payload carries.
- `OUTPUT_SCHEMA_VERSIONS` — every label ever published, oldest first, with
  the current one newest; a single entry today (`src/schema/input.ts:20`).
- A `hosted(name)` helper calling `HostedSchema.github({ repo, path:
  "schemas", name, versions, current, appendVersion: false })` — the
  directory carries the label, so the file name does not repeat it
  (`src/schema/input.ts:32-40`).
- `OutputSchemaIdentity = hosted("output")` and
  `InputSchemaIdentity = hosted("input")` (`src/schema/input.ts:43`, `46`).

The URLs the code emits are those identities' `$id` getters, not string
literals: `INPUT_SCHEMA_URL: string = InputSchemaIdentity.$id`
(`src/schema/input.ts:52`) and `SCHEMA_URL: string = OutputSchemaIdentity.$id`
(`src/schema/report-output.ts:13`). Because `SCHEMA_URL` is a `string` rather
than a literal type, `ReportOutput`'s `$schema` field decodes as `string`;
runtime decoding still rejects any other value
(`src/schema/report-output.ts:41-44`).

## What is derived from it

`lib/scripts/schemastore.config.ts`[^schemastore-config] is the
`@effected/schemastore-cli` target manifest: a `defineConfig` with
`outputDir: "../../schemas"` (relative to the config file, not the repo
root) and one entry per document, keyed by the identity's `name` and handed
the identity as `hosted` (`lib/scripts/schemastore.config.ts:49-67`).
`defineConfig` rejects an entry keyed differently from its identity, so the
`$id` the CLI writes and the `$schema` a payload carries are one derivation,
not two that must agree. The config lives under `lib/scripts/` because
`src/` is action source only, so the package scripts pass its path
explicitly instead of relying on the CLI's upward discovery.

Both entries are `published: false` (`lib/scripts/schemastore.config.ts:60`,
`65`): the `1.0` label has never shipped, so a contract change regenerates
the file in place instead of demanding a bump. Once a label ships, the entry
flips to `published: true`, and a contract-class change at that label is
answered by bumping `OUTPUT_SCHEMA_VERSION` and keeping the old label in
`OUTPUT_SCHEMA_VERSIONS` as a frozen file — see
[bump-the-output-schema-version](../runbooks/bump-the-output-schema-version.md)
and
[versioned-schema-documents](../decisions/versioned-schema-documents.md).

Every object in both documents is emitted closed
(`additionalProperties: false`). That is the library's own default —
`StoreDocumentOptions.jsonSchema` documents `onExcessProperty` as defaulting
to `"error"` because a published document is a contract, where core's
`Schema.toJsonSchemaDocument` default has been `"ignore"` (open) since
rc.113 (`node_modules/@effected/schemastore/index.d.ts:267-270`)[^schemastore-types].
The config passes no `jsonSchema` option, so nothing here has to remember to
close them. The runtime decoders in `src/schema/` keep core's `"ignore"`
default and tolerate excess keys; the published documents are deliberately
the stricter of the two.

## The commands

- `pnpm schema:build` — `schemastore build lib/scripts/schemastore.config.ts`
  (`package.json:29`): lints each document, runs the ajv strict-mode gate,
  applies the drift policy, and writes only the documents whose content
  actually changed. Wired as the turbo `schema:build` task, which depends on
  `types:check`, outputs `schemas/**`, and is a dependency of `build:prod`
  (`turbo.json`).
- `pnpm schema:check` — the identical walk with no writes (`package.json:30`).
  It reports each document as unchanged, would-write, or drift, and exits
  non-zero when a build would write or refuse anything. `pnpm ci:test` runs
  it before vitest (`package.json:22`), so it — not a vitest test — is the
  drift guard in CI.

## What breaks if an entry is wrong

- An Effect Schema change without `pnpm schema:build` leaves a stale
  document on disk; `pnpm schema:check` fails `ci:test`.
- A hand edit to `schemas/1.0/*.json` is drift in the other direction and
  fails the same check; the CLI compares by content, so a formatter reflow
  alone does not.
- A label bump that misses the prose — `action.yml`'s `result` description
  and the README's example `$schema` and document links — fails nothing in
  the CLI, which is why `__test__/action-contract.test.ts`'s third leg pins
  that prose to `SCHEMA_URL`, `INPUT_SCHEMA_URL`, and each identity's
  `fileName` (`__test__/action-contract.test.ts:105-133`); see
  [action-contract](action-contract.md).
- A label listed in `OUTPUT_SCHEMA_VERSIONS` with no file on disk, or a
  frozen file whose `$id` no longer matches the derived one, fails the CLI's
  pre-flight before anything is written.

[^input-schema]: `../../src/schema/input.ts`
[^schemastore-config]: `../../lib/scripts/schemastore.config.ts`
[^schemastore-types]: `npm:@effected/schemastore` (0.13.0, `index.d.ts`)
