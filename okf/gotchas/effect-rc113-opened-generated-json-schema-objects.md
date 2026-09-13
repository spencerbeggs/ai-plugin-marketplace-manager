---
title: effect rc.113 opened the generated JSON Schema objects
description: A drift-test failure after an effect bump, and the schema flip it reports, both look like a broken contract when the pipeline already closed it back up.
type: Gotcha
resource: ../../lib/scripts/generate-schema.ts
stale_after: 2027-03-13T00:00:00Z
tags: [compat, deps, testing]
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: af255ffd254bdf28f71d819db92ed3554f8e4195d04651f7307f63c6ad8522e7
---

# effect rc.113 opened the generated JSON Schema objects

## What a reader sees

After an `effect` bump, the two drift tests in
`__test__/generate-schema.test.ts` fail with "… is stale — run
`pnpm generate-schema`", and running that command flips every
`additionalProperties: false` in the root
`claude-code-marketplace-manager.{input,output}.json` documents to `true`.

## What they wrongly conclude

That the committed schemas are stale and should be regenerated and committed
— which would silently loosen the published contract, letting consumers pass
properties nobody modeled — or that the failure is a decode / excess-property
runtime problem in the action itself.

## What is true

Runtime decoding is unaffected; this is a JSON Schema *generation* default,
not a decoder change. `effect` rc.113 flipped `Schema.toJsonSchemaDocument`'s
default from closed to open objects. In the installed rc.115 source, the
branch that sets `additionalProperties` for an ordinary object computes it as
`hasUnrepresentableIndexPattern || options?.onExcessProperty !== "error"`
(`node_modules/effect/src/internal/schema/toJsonSchemaDocument.ts:502`) — so
with no option supplied, the schema comes out open. `onExcessProperty` is
declared `"ignore" | "error"`, documented with `"ignore"` as the default that
"leaves unmodeled properties open"
(`node_modules/effect/src/Schema.ts:14803-14821`).

The generator already accounts for this: it passes a `CLOSED_OBJECTS` const
(`{ onExcessProperty: "error" }`) as the `jsonSchema` option to every
`SchemaTarget.make` call, through `@effected/schemastore`'s pass-through
(`lib/scripts/generate-schema.ts:57`, applied at `lib/scripts/generate-schema.ts:72`
and `:78`). With that option in place, regenerating reproduces the committed,
closed documents byte-for-byte — the drift test failure this gotcha describes
only appears when the pin predates that fix, or when a future `SchemaTarget`
is added without copying the same `jsonSchema: CLOSED_OBJECTS` line.

## Related

[effect-schemas](../models/effect-schemas.md) documents the generator
pipeline `CLOSED_OBJECTS` is part of.
[keep-the-action-contract-in-sync](../conventions/keep-the-action-contract-in-sync.md)
states the rule to regenerate after an Effect Schema change — which is a
different situation from this one, where regenerating with the option
missing is the trap, not the fix.
