---
type: Convention
status: stable
title: Test doubles transform; fixtures isolate one field
description: Make a double perform the real transformation, make a fixture invalid only in the field under test, and inject the failure an ordering guard actually protects against.
stale_after: 2027-03-13T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-11-01T19:08:50Z
tags:
  - testing
sources:
  - id: program-test
    resource: ../../__test__/program.test.ts
  - id: manifest-validator-test
    resource: ../../__test__/services/ManifestValidator.test.ts
  - id: post-test
    resource: ../../__test__/post.test.ts
integrity:
  generated:
    body: de107ed34bf26997
---

# Test doubles transform; fixtures isolate one field

Three rules, each pinned by the incident that made it load-bearing.

## A double must perform the transformation the real implementation performs

`__test__/program.test.ts` records outputs with the kit's
`ActionOutputs.recording()` rather than a hand-written override: its
`setJson` encodes the value through the schema it is handed, exactly as the
real layer does, and records the encoded text.[^program-test] A double that
accepted the schema and ignored it would leave every assertion built on it
structurally incapable of catching a projection or schema drift: the real
implementation would fail to encode, `program.ts` would swallow that into a
`logWarning`, and the machine-readable `result` output would silently
vanish in production with the suite still green.

Because the recording double behaves like production, a drift arrives as a
typed `OutputEncodeError` that `program` degrades to a warning, exactly as
it would on a runner — not as a defect. It is caught instead by the shape
of the assertions: every test that reaches an emit asserts the `result`
output is present, so a drift fails as a missing `result`.[^program-test]
Reach for the kit's recording doubles first; a hand-written double has to
re-implement the transformation and is where this rule gets broken. The
same holds for the filesystem: `program.test.ts` and
`services/ManifestEditor.test.ts` run on `@effected/memfs`
(`MemoryFileSystem.layerWith({...})`), where the action's relative manifest
paths resolve from the volume root `/` as they resolve from the checkout on
a runner — no temp directories and no `process.chdir`.

## A validation fixture must be structurally valid except in the field under test

`ManifestValidator.test.ts`'s `withSource` helper builds a manifest that is
structurally valid in every respect but the one field a test overrides, and
every negative case asserts the error TEXT, not just that something
failed.[^manifest-validator-test] This is a repair of a real incident: the
file's sha fixture once omitted the top-level `owner` field the schema
requires, so it failed validation on `owner` and stayed green even after the
sha rule itself was deleted from `ManifestValidator.ts`.[^manifest-validator-test]

Two structural corollaries follow from the same rule:

- The untouched-plugin scoping test — proving a plugin the run did not patch
  is not retroactively rejected — has to use a bad `url`, because `url` is
  the only one of the four per-plugin fields whose bad value is still
  *structurally* valid. A bad `sha` or an empty `path` would trip the ajv
  structural pass too, and that pass is not scoped to touched plugins — the
  test would fail for a reason unrelated to the scoping it is meant to
  pin.[^manifest-validator-test]
- The URL rule is covered from three directions, since it is the one
  semantic rule with a security consequence: a foreign host, a
  `github.com`-lookalike host, and a plain `http://` GitHub URL.[^manifest-validator-test]

## A fixture that pins an ordering must inject the failure the ordering actually guards against

`__test__/post.test.ts` makes the start-time state read DIE — via
`Effect.die`, not a typed failure — rather than fail typed.[^post-test] This
is the detail that gives the ordering test teeth: `post` wraps itself in
`catchDefect`, so a defect raised *before* revocation would be swallowed and
the phase would report success having revoked nothing, but revocation runs
first, so the defect never reaches it. A typed failure would not detect a
reordering, since `post` already catches those elsewhere; only a defect
exposes whether revocation still runs first if someone reorders the two
reads.[^post-test]

[^program-test]: `../../__test__/program.test.ts:86-153,194-206`
[^manifest-validator-test]: `../../__test__/services/ManifestValidator.test.ts:18-37,78-100,102-113`
[^post-test]: `../../__test__/post.test.ts:73-90`
