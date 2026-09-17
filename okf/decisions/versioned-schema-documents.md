---
type: Decision
title: Version the JSON Schema documents under their own path per label
description: Both generated JSON Schema documents live at schemas/<version>/output.json and schemas/<version>/input.json, derived from one HostedSchema identity, so a payload's $schema URL keeps resolving to the shape it was written against after the contract moves.
status: draft
tags:
  - compat
  - release
sources:
  - id: input-schema
    resource: ../../src/schema/input.ts
    title: "OUTPUT_SCHEMA_VERSION, OUTPUT_SCHEMA_VERSIONS, and the two HostedSchema identities"
  - id: schemastore-config
    resource: ../../lib/scripts/schemastore.config.ts
    title: "the schemastore CLI target manifest"
  - id: contract-test
    resource: ../../__test__/action-contract.test.ts
    title: "Leg 3 — the prose that quotes the derived URLs"
generated:
  by: okfit/claude-code
  at: 2026-09-17T19:20:18Z
  body_sha256: 13cabe7c2b778893e7eb53844ae76a69d6ef7c712ef1ed60301e372cb5abc406
---

# Version the JSON Schema documents under their own path per label

## Context

The action emits a structured `result` output on every run, and every
payload carries a `$schema` pointing at the document that describes its
shape (`SCHEMA_URL`, `src/schema/report-output.ts:13`). A consumer that
stores or replays an old payload relies on that URL continuing to resolve
to the schema the payload was actually written against — a URL that a
later, incompatible schema silently took over would misdescribe every
payload emitted before the change.

Before this decision both documents sat unversioned at the repository root
(`claude-code-marketplace-manager.{input,output}.json`), written by a
repository-owned `lib/scripts/generate-schema.ts` that also had to pin
`onExcessProperty: "error"` by hand and carry its own vitest drift test.

## Decision

Both documents live under `schemas/<version>/`, today
`schemas/1.0/output.json` and `schemas/1.0/input.json`, and are published at
`https://raw.githubusercontent.com/spencerbeggs/claude-code-marketplace-manager/main/schemas/1.0/output.json`
and `.../schemas/1.0/input.json`. The input document has no payload-replay
problem of its own — it describes the action's input, not something the
action emits — but one layout and one label for both keeps the config and
the constants that name them to a single version.

The identity is constructed once. `src/schema/input.ts`[^input-schema]
declares `OUTPUT_SCHEMA_VERSION = "1.0"` and `OUTPUT_SCHEMA_VERSIONS`
(`src/schema/input.ts:13`, `20`) and builds `OutputSchemaIdentity` /
`InputSchemaIdentity` with `HostedSchema.github({ repo, path: "schemas",
name, versions, current, appendVersion: false })`
(`src/schema/input.ts:32-46`). `SCHEMA_URL` and `INPUT_SCHEMA_URL` are those
values' `$id` getters (`src/schema/report-output.ts:13`,
`src/schema/input.ts:52`), and `lib/scripts/schemastore.config.ts`[^schemastore-config]
receives the same values as each entry's `hosted`
(`lib/scripts/schemastore.config.ts:53-66`) — so the URL a payload carries
and the `$id` the CLI writes are one derivation rather than two that must
agree. `defineConfig` rejects an entry keyed by anything other than its
identity's `name`.

Generation is `@effected/schemastore-cli` over that config: `pnpm
schema:build` writes, `pnpm schema:check` is the identical walk with no
writes and the CI gate (`package.json:22`, `29-30`). Each entry carries
`published`. A label consumers depend on is `published: true`, and the
drift policy then refuses to rewrite its file in place when the change is a
contract change — a removed or renamed field, a changed type — failing with
a line that names the `$id`, the change, and the suggested next label. The
response to a genuine contract break is bumping `OUTPUT_SCHEMA_VERSION`
(which moves `SCHEMA_URL`, `INPUT_SCHEMA_URL`, and both entries' current
label together) while keeping the old label in `OUTPUT_SCHEMA_VERSIONS`,
which writes new files at the new version's path and leaves the published
ones untouched as frozen files the CLI verifies but never regenerates.
`published: false` — the state today, since `1.0` has never shipped
(`lib/scripts/schemastore.config.ts:60`, `65`) — lets the current label
iterate in place.

The move itself is a breaking change to the published `$schema` URL: the
old root-level URL is not preserved as a frozen label, because no payload
was ever emitted against the new layout's predecessor and the old
documents were removed rather than relabelled.

## Alternatives rejected

- **An unversioned root output file**, the arrangement before this
  decision. A schema change under that scheme silently re-points every
  previously emitted payload's `$schema` at a shape it was never written
  against, with no way for a consumer to detect the mismatch from the URL
  alone.
- **A repository-owned generation script.** `lib/scripts/generate-schema.ts`
  hand-rolled the target list, the closed-object option, the layer wiring
  and a vitest drift test around `SchemaPipeline`; every consumer of the
  package wrote the same plumbing, and each new target had to remember to
  copy the `jsonSchema` option or ship open objects. The CLI ships that once,
  closes objects by default, and the repository now owns only the target
  manifest.
- **A versioned file name under an unversioned directory**
  (`schemas/output-1.0.json`). `appendVersion: false` puts the label on the
  directory instead, so the file name inside it never repeats it and the
  README's document links change only in their directory segment on a bump.

## Consequences

- An old payload's `$schema` continues to resolve to the exact shape it was
  written against, because a contract change never overwrites a published
  version's file — it always lands at a new path.
- `pnpm schema:check`, run before vitest by `pnpm ci:test`, is the whole
  drift guard: every document is in the state the CLI would itself produce,
  every frozen file exists and declares its derived `$id`, and every object
  is closed by the library's default. There is no vitest drift test any
  more; there is nothing left for one to pin.
- What the CLI cannot see is prose: `action.yml`'s `result` description and
  the README's example `$schema` and document links spell the URL and paths
  by hand, and a bump that misses them fails nothing. Leg 3 of
  `__test__/action-contract.test.ts`[^contract-test] pins those to
  `SCHEMA_URL`, `INPUT_SCHEMA_URL`, and each identity's `fileName`
  (`__test__/action-contract.test.ts:105-133`).
- Bumping the version is one constant plus keeping the old label in
  `OUTPUT_SCHEMA_VERSIONS`; the procedure is
  [bump-the-output-schema-version](../runbooks/bump-the-output-schema-version.md).
  The shape itself is documented in [effect-schemas](../models/effect-schemas.md)
  and, from the consumer's side, [result-output](../interfaces/result-output.md).

[^input-schema]: `../../src/schema/input.ts`
[^schemastore-config]: `../../lib/scripts/schemastore.config.ts`
[^contract-test]: `../../__test__/action-contract.test.ts`
