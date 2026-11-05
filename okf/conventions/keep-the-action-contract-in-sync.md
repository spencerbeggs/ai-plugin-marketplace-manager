---
type: Convention
title: Keep the Action Contract in Sync
description: Editing an input or output means editing three places, an Effect Schema change means rebuilding the versioned JSON Schema documents, and a schema label bump means updating the prose that quotes the URL.
status: stable
stale_after: 2026-12-12T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-11-05T23:25:35Z
tags:
  - dx
  - testing
integrity:
  generated:
    body: ca9ab7eb86cfc2b9
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
it, by running the code with the kit's recording doubles
(`ActionInput.recording`, `ActionOutputs.recording()`) and asserting
`ActionManifest.diff` against `action.yml` finds nothing unread, unwritten,
or undeclared — see [action-contract](../models/action-contract.md).
Recording sees only the path the run takes, so a new input read off that
path (outside `parseInputs`'s manual path or `pre.ts`'s
`readAppCredentials`) needs the test's recorded run extended to reach it.

Separately: after any change to an Effect Schema that feeds a published
document (`ReportOutput` in `src/schema/report-output.ts`, `JsonInput` in
`src/schema/input.ts`), run `pnpm schema:build` and never hand-edit
`schemas/2.0/output.json` or `schemas/2.0/input.json` — both are generated
by `effected schema` from `lib/scripts/schemastore.config.ts`
(`schemas/1.0/` is a frozen label the CLI checks but never regenerates), and
`pnpm schema:check` (run before vitest by `pnpm ci:test`, `package.json:22`)
fails CI on drift in either direction rather than silently tolerating a hand
edit. See [effect-schemas](../models/effect-schemas.md).

And when the schema label moves — `OUTPUT_SCHEMA_VERSION` in
`src/schema/input.ts` — update the prose that spells the URL and paths by
hand: `action.yml`'s `result` description and the README's example `$schema`
and document links. The CLI cannot see prose; Leg 3 of
`__test__/action-contract.test.ts` pins it to `SCHEMA_URL`,
`INPUT_SCHEMA_URL`, and each identity's `fileName`
(`__test__/action-contract.test.ts:142-170`). Follow
[bump-the-output-schema-version](../runbooks/bump-the-output-schema-version.md).
