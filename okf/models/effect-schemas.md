---
type: DataModel
title: Effect Schemas
description: The Effect Schema sources that generate the committed root JSON Schemas, and the drift/validation pipeline built on them.
resource: ../../src/schema
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: 7fbee3feb5e2541bff4ae3d712d805bce45ff07c7a2282bfaf38c897856f48e1
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
| `claude-code-marketplace-manager.output.json` | Generated from `ReportOutput` (`src/schema/report-output.ts`) | The `result` output's published, drift-tested contract. |
| `claude-code-marketplace-manager.input.json` | Generated from `JsonInput` (`src/schema/input.ts`) | The `json` input's published, drift-tested contract. |
| `src/schema/claude-code-marketplace.json` | Vendored SchemaStore asset (65KB, not generated) | Structural validation of the edited manifest, compiled by ajv in `src/services/ManifestValidator.ts:8` (`import marketplaceSchema from "../schema/claude-code-marketplace.json"`). |

The two generated files are produced by `lib/scripts/generate-schema.ts`,
which exports both `targets` — an array of `SchemaTarget` entries, one per
document, naming its Effect Schema, its `$id`, and its output path
(`lib/scripts/generate-schema.ts:67-80`) — and `AppLayer`, the
`SchemaFile.layer` + `SchemaValidator.layer` wiring the pipeline walk needs
(`lib/scripts/generate-schema.ts:111`). `__test__/generate-schema.test.ts`
imports both directly rather than re-declaring them, so the drift check runs
the generator's own walk against the generator's own wiring — never a copy
that could quietly diverge (`__test__/generate-schema.test.ts:5`, and the
generator's own remark at `lib/scripts/generate-schema.ts:33-34`).

`CLOSED_OBJECTS` (`onExcessProperty: "error"`) is passed to every target
because `effect` rc.113 flipped `Schema.toJsonSchemaDocument`'s default to
leave unmodeled properties open; this restores the `additionalProperties:
false` shape the committed documents have always declared
(`lib/scripts/generate-schema.ts:49-57`).

## `SchemaPipeline.checkOne`'s three signals

`__test__/generate-schema.test.ts` calls `SchemaPipeline.checkOne(target)`
for each target and asserts on three independent signals, each with a
different remedy:

- **`blocked`** — the document could never have been written at all
  (a structural lint or ajv strict-mode finding at `warning` severity or
  above). Remedy: fix the findings; regenerating will not help.
- **`contractBlocked`** — the pipeline's default contract policy would
  refuse the write because the change is a breaking one. Remedy: bump
  `SCHEMA_VERSION`/`INPUT_SCHEMA_VERSION`, not regenerate.
- **`wouldWrite`** — ordinary drift between the committed file and what the
  Effect Schema would currently produce. Remedy: run `pnpm generate-schema`.

(`__test__/generate-schema.test.ts:16-31`.) A fourth assertion,
`DocumentDiff.isClean(result.change)`, is the content-vs-text distinction
made explicit: `result.change` classifies what actually differed
(`"contract"` is a consumer-visible break, `"annotations"` is documentation
only), and comparing by content rather than raw bytes means a formatter
reflowing the committed file does not provoke a spurious rewrite on the next
run (`__test__/generate-schema.test.ts:22-23`, `32`;
`lib/scripts/generate-schema.ts:20-23`).

`generate.ts`'s own run (`pnpm generate-schema`) uses `SchemaPipeline.run`,
which performs the identical walk but also writes: it lints, runs the ajv
strict-mode gate against the default blocking predicate (`severity ===
"warning"`), fails with a `SchemaGateError` carrying every blocking finding,
and writes only the documents whose content actually changed
(`lib/scripts/generate-schema.ts:82-101`).
