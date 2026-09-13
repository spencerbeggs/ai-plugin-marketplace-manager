---
type: Convention
title: Keep the Action Contract in Sync
description: Editing an input or output means editing three places, and an Effect Schema change means regenerating the root JSON Schemas.
status: draft
stale_after: 2026-12-12T00:00:00Z
generated:
  by: okfit/claude-code
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
`src/schema/input.ts`), run `pnpm generate-schema` and never hand-edit the
root `claude-code-marketplace-manager.input.json` or
`claude-code-marketplace-manager.output.json` — both are generated output,
and `__test__/generate-schema.test.ts` fails the suite on drift rather than
silently tolerating a hand edit. See
[effect-schemas](../models/effect-schemas.md).
