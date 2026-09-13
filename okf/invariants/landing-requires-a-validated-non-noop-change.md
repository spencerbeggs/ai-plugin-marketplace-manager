---
title: Landing requires a validated, non-no-op change
description: Nothing can be committed that is byte-stable or unvalidated — the type system enforces it, not a call-site convention.
type: Invariant
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
generated:
  by: okfit/claude-code
---

# Landing requires a validated, non-no-op change

**Property.** `ManifestCommitter.land` cannot be called with unvalidated
manifest text, and it cannot be called with a change that turned out to be
byte-stable. Both are ruled out before `land` runs at all — not by a
reviewer noticing a missing call, but because there is no value of the
right type to pass it.

**Mechanism.** `ManifestEditor.applyPatches` returns an `EditResult` typed as
a discriminated union, `NoopEdit | ChangedEdit`, tagged on `changed`.[^manifest-editor]
A `NoopEdit` types `changes` as `readonly []`, so a byte-stable result
cannot carry the per-write change records that netted out to nothing — the
union itself keeps `changes` and `changed` self-consistent rather than a
runtime check. The only way to obtain a `ChangedEdit` is to narrow past the
no-op guard on that union.

`ManifestValidator.validateEdit` accepts nothing but a `ChangedEdit`, runs
`validateManifest` (ajv structural plus semantic checks) against its
`editedText`, and on success mints a `ValidatedManifestChange` — a
`Brand.Branded<{ editedText, changes }, "ValidatedManifestChange">` produced
only by `Brand.nominal<ValidatedManifestChange>()` inside this
module.[^manifest-validator] `ManifestCommitter.land`'s `LandParams.change`
field is typed as exactly that brand, not `string` or the plain shape it
wraps.[^manifest-committer] There is no other constructor for the brand in
this codebase, so a caller that skips `validateEdit` has no value to hand
`land` — the compiler rejects the call before any runtime guard would need
to.

**What a refactor would have to break.** Passing raw `editedText` (or an
unbranded object of the same shape) to `land` in place of the
`ValidatedManifestChange` parameter is a compile error, not a runtime
check that a careless caller could route around. To land unvalidated or
byte-stable text, a refactor would have to either delete the brand and
loosen `LandParams.change` back to a plain string/object, or reach for a
deliberate cast (`as ValidatedManifestChange`) at the call site — both are
visible, out-of-band changes to `program.ts`, not something a change to
`ManifestEditor.ts` or `ManifestValidator.ts` alone could quietly undo.

[^manifest-editor]: `EditResult`, `NoopEdit` and `ChangedEdit` are declared at
    `../../src/services/ManifestEditor.ts:13-38`; the no-op/changed branch
    that returns each variant is at `../../src/services/ManifestEditor.ts:101-104`.
[^manifest-validator]: `ValidatedManifestChange`'s brand and `validateEdit`
    are declared at `../../src/services/ManifestValidator.ts:106-127`.
[^manifest-committer]: `LandParams.change: ValidatedManifestChange` is
    declared at `../../src/services/ManifestCommitter.ts:26`.
