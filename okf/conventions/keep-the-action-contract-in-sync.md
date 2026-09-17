---
type: Convention
title: Keep the Action Contract in Sync
description: Editing an input or output means editing three places, an Effect Schema change means rebuilding the versioned JSON Schema documents, and a schema label bump means updating the prose that quotes the URL.
status: stable
stale_after: 2026-12-12T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-09-17T19:20:18Z
  body_sha256: 38dd1b1a4723547fc034dec4e91e122e9069b7cde6da01472f2df56901c6f403
tags:
  - dx
  - testing
---

# Keep the Action Contract in Sync

Adding or renaming an input or output means editing **all three** of:

1. `action.yml` — the manifest GitHub actually reads.
2. `src/contract.ts` — `INPUT_NAMES`/`OUTPUT_NAMES` (and `INPUT_DEFAULTS`, if
   the input's default is non-empty).
3. The call site — `src/inputs.ts` for a read, `src/pre.ts` or
   `src/program.ts` for a read or a write.

Nothing else notices when the third is skipped: a rename that lands in the
manifest and in `contract.ts` but misses the call site is a perfectly
type-correct action that reads an input nobody supplies and quietly takes
the default — no compile error, no runtime error, just wrong behavior
(`src/contract.ts:7-12`). `__test__/action-contract.test.ts` is what catches
it, by reading the source text of `inputs.ts`/`pre.ts`/`program.ts` for the
matching `ActionInput.\w+(...)`/`outputs.set\w*(...)` call — see
[action-contract](../models/action-contract.md).

Separately: after any change to an Effect Schema that feeds a published
document (`ReportOutput` in `src/schema/report-output.ts`, `JsonInput` in
`src/schema/input.ts`), run `pnpm schema:build` and never hand-edit
`schemas/1.0/output.json` or `schemas/1.0/input.json` — both are generated
by `@effected/schemastore-cli` from `lib/scripts/schemastore.config.ts`, and
`pnpm schema:check` (run before vitest by `pnpm ci:test`, `package.json:22`)
fails CI on drift in either direction rather than silently tolerating a hand
edit. See [effect-schemas](../models/effect-schemas.md).

And when the schema label moves — `OUTPUT_SCHEMA_VERSION` in
`src/schema/input.ts` — update the prose that spells the URL and paths by
hand: `action.yml`'s `result` description and the README's example `$schema`
and document links. The CLI cannot see prose; Leg 3 of
`__test__/action-contract.test.ts` pins it to `SCHEMA_URL`,
`INPUT_SCHEMA_URL`, and each identity's `fileName`
(`__test__/action-contract.test.ts:105-133`). Follow
[bump-the-output-schema-version](../runbooks/bump-the-output-schema-version.md).
