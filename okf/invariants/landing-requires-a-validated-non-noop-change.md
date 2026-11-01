---
title: Landing requires a non-empty array of validated, non-no-op changes
description: Nothing can be committed that is byte-stable or unvalidated, and land cannot be called with zero manifests — the type system enforces both, not a call-site convention.
type: Invariant
status: stable
resource: ../../src/services/ManifestValidator.ts
stale_after: 2027-03-13T00:00:00Z
tags:
  - validation
  - architecture
sources:
  - id: manifest-editor
    resource: ../../src/services/ManifestEditor.ts
  - id: manifest-validator
    resource: ../../src/services/ManifestValidator.ts
  - id: manifest-committer
    resource: ../../src/services/ManifestCommitter.ts
  - id: program
    resource: ../../src/program.ts
generated:
  by: okfit/claude-code
  at: 2026-09-23T21:08:46Z
integrity:
  generated:
    body: 5ca6b0e4fe29a0aa
---

# Landing requires a non-empty array of validated, non-no-op changes

**Property.** `ManifestCommitter.land` cannot be called with unvalidated
manifest text, cannot be called with a change that turned out to be
byte-stable, and — since v2 — cannot be called with an empty collection of
changes. All three are ruled out before `land` runs at all — not by a
reviewer noticing a missing call, but because there is no value of the
right type to pass it.

**Mechanism.** `ManifestEditor.applyPatches`, run once per targeted
marketplace, returns an `EditResult` typed as a discriminated union,
`NoopEdit | ChangedEdit`, tagged on `changed`.[^manifest-editor] A `NoopEdit`
types `changes` as `readonly []`, so a byte-stable result cannot carry the
per-write change records that netted out to nothing — the union itself
keeps `changes` and `changed` self-consistent rather than a runtime check.
The only way to obtain a `ChangedEdit` is to narrow past the no-op guard on
that union, once per manifest.

`ManifestValidator.validateEdit` accepts nothing but a `ChangedEdit` (plus
the target `Marketplace` descriptor), runs `validateManifest` (ajv
structural plus semantic checks, against that marketplace's own schema and
source rules) against its `editedText`, and on success mints a
`ValidatedManifestChange` — a `Brand.Branded<{ marketplace, path,
editedText, changes }, "ValidatedManifestChange">` produced only by
`Brand.nominal<ValidatedManifestChange>()` inside this
module.[^manifest-validator] `program.ts`'s orchestration loop runs this
per targeted marketplace, in `MARKETPLACE_ORDER`, and accumulates the
results into `validated: Array<ValidatedManifestChange>`.[^program]

`ManifestCommitter.land`'s `LandParams.changes` field is typed as
`Arr.NonEmptyReadonlyArray<ValidatedManifestChange>` — not `ValidatedManifestChange`,
not a plain array, and not `string`.[^manifest-committer] `program.ts`
narrows to that non-empty type with `Arr.isReadonlyArrayNonEmpty(validated)`
before calling `land`; if every targeted manifest turned out byte-stable,
`validated` stays empty, the narrowing fails, and the run emits a `noop`
result and returns without ever reaching `land`. There is no other
constructor for the brand in this codebase and no other way to produce it
from the loop's accumulator, so a caller that skips either
guard has no value of the right type to hand `land` — the compiler rejects
the call before any runtime guard would need to.

**What a refactor would have to break.** Passing a plain (possibly empty)
array, a bare `ValidatedManifestChange`, or raw `editedText` in place of the
`changes` parameter is a compile error, not a runtime check a careless
caller could route around. To land unvalidated, byte-stable, or zero
manifests, a refactor would have to either delete the brand and loosen
`LandParams.changes` back to a plain array/string, or reach for a
deliberate cast at the call site — both are visible, out-of-band changes to
`program.ts`, not something a change to `ManifestEditor.ts` or
`ManifestValidator.ts` alone could quietly undo.

[^manifest-editor]: `EditResult`, `NoopEdit` and `ChangedEdit` are declared
    in `../../src/services/ManifestEditor.ts`; the no-op/changed branch
    that returns each variant runs once per targeted marketplace.
[^manifest-validator]: `ValidatedManifestChange`'s brand and `validateEdit`
    are declared in `../../src/services/ManifestValidator.ts`, and now
    carry `marketplace`/`path` alongside `editedText`/`changes`.
[^manifest-committer]: `LandParams.changes: Arr.NonEmptyReadonlyArray<ValidatedManifestChange>`
    is declared in `../../src/services/ManifestCommitter.ts`.
[^program]: The per-marketplace loop and the `Arr.isReadonlyArrayNonEmpty`
    narrowing are in `../../src/program.ts`.
