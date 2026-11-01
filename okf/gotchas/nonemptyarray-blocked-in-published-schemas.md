---
title: Schema.NonEmptyArray no longer fails the ajv strict gate (resolved upstream)
description: "Retired: Schema.NonEmptyArray's Draft-07 lowering used to trip ajv's strict-mode gate in a published schema; effected#818 was closed and, from @effected/schemastore 0.28.0, it lowers to a plain minItems: 1, so JsonInput.plugins now uses it directly."
type: Gotcha
status: deprecated
resource: ../../src/schema/input.ts
stale_after: 2027-03-23T00:00:00Z
tags: [deps, testing]
sources:
  - id: input-schema
    resource: ../../src/schema/input.ts
    last_modified: 2026-11-01T00:00:00Z
  - id: upstream-issue
    resource: 'https://github.com/spencerbeggs/effected/issues/818'
    title: "@effected/schemastore's Draft-07 lowering of NonEmptyArray"
    last_modified: 2026-09-28T00:00:00Z
  - id: schema-check
    resource: npm:@effected/schemastore-cli
    title: "pnpm schema:check and schemastore check --drift strict at @effected/schemastore 0.28.0 / @effected/schemastore-cli 0.28.0, Effect 4.1.1"
    last_modified: 2026-11-01T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-11-01T18:59:10Z
integrity:
  generated:
    body: a8885699768aa50b
---

# `Schema.NonEmptyArray` no longer fails the ajv strict gate

## Status: retired

This trap no longer holds. The upstream bug, spencerbeggs/effected#818, was
closed on 2026-09-28[^upstream-issue]. With the installed
`@effected/schemastore` 0.28.0 and `@effected/schemastore-cli` 0.28.0 (on
Effect 4.1.1), `JsonInput.plugins` is now spelled
`Schema.NonEmptyArray(PluginPatch)`[^input-schema], and `pnpm schema:check`
and `schemastore check --drift strict` both report zero drift and zero gate
failures[^schema-check]: the lowering now produces a byte-identical
`schemas/2.0/input.json`, still a plain `minItems: 1` on an ordinary
`items` schema. The concept is kept, deprecated, so an old pointer to it
lands on the resolution rather than on a live warning.

## What the trap was

`Schema.NonEmptyArray` was the obvious spelling for "`plugins` must be
non-empty" and decoded correctly, but `@effected/schemastore`'s Draft-07
lowering emitted a 1-tuple `items` without a matching `minItems`/
`maxItems`/`additionalItems`, which ajv's strict mode rejects. It surfaced
only at the `schema:build` strict-mode gate, never at `tsc` or at runtime
decode. The workaround was
`Schema.Array(PluginPatch).check(Schema.isMinLength(1))`, which expressed
the same runtime constraint.

## What to watch for

If a future `@effected/schemastore` bump regresses the lowering,
`pnpm schema:check` (first step of `ci:test`) reports the drift in
`schemas/2.0/input.json` or a gate failure; that is the signal to revisit
the spelling, not a reason to avoid `Schema.NonEmptyArray` pre-emptively.

## Related

[effect-schemas](../models/effect-schemas.md) documents the schema-build
pipeline and [action-inputs](../interfaces/action-inputs.md) the
`JsonInput.plugins` contract.
`Arr.NonEmptyReadonlyArray<ValidatedManifestChange>` on `LandParams.changes`
(see
[landing-requires-a-validated-non-noop-change](../invariants/landing-requires-a-validated-non-noop-change.md))
was never affected, since `LandParams` is not a published document.

[^upstream-issue]: <https://github.com/spencerbeggs/effected/issues/818>
[^input-schema]: `../../src/schema/input.ts`
[^schema-check]: `npm:@effected/schemastore-cli` (0.28.0)
