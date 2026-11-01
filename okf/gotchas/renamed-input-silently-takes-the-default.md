---
title: A renamed input silently takes the default
description: Renaming an input in action.yml or a call site compiles and runs clean, but the code quietly reads nobody's value.
type: Gotcha
status: stable
resource: ../../src/inputs.ts
stale_after: 2027-03-13T00:00:00Z
tags: [dx, testing]
generated:
  by: okfit/claude-code
  at: 2026-11-01T19:08:50Z
sources:
  - id: inputs
    resource: ../../src/inputs.ts
    last_modified: 2026-09-13T00:00:00Z
  - id: action-contract-test
    resource: ../../__test__/action-contract.test.ts
    last_modified: 2026-09-13T00:00:00Z
integrity:
  generated:
    body: 6d278e53d576f9f8
---

# A renamed input silently takes the default

## What a reader sees

Someone renames an input — in `action.yml`, or at one of the call sites that
still spell it as a string literal (`inputs.ts`, `pre.ts`,
`program.ts`)[^inputs] — and the build compiles, the type checker is silent,
and the test suite passes (short of the one test that exists specifically to
catch this).

## What they conclude

The rename is done: nothing complained, so nothing depends on the old name
anywhere that matters.

## What is true

Every input read goes through `ActionInput.string("name")` (or `.boolean`,
`.literals`, `.redacted`), each keyed by a bare string literal — there is no shared enum or union type
tying a name at the call site to a name in `action.yml`, so a mismatch between
the two is invisible to both the compiler and the runtime. Every optional
input is read with `Config.withDefault(...)`, because the runner writes `""`
for an input nobody supplied and the kit treats missing and empty as the same
"missing data".[^inputs] So when a rename breaks the link between `action.yml`
and a call site, the read does not fail — it just resolves to whichever
default that particular `withDefault` supplies (the empty string, mapped to
`null`/"missing" by `emptyToNull`, or an `INPUT_DEFAULTS` entry for a mirrored
input) exactly as though the caller had never set it at all. No compile error,
no runtime error — only quietly wrong behavior downstream, since the run
proceeds using a default instead of the value a caller thought they were
passing.

The one thing that does catch it is
`__test__/action-contract.test.ts`: it decodes `action.yml` with the kit's
`ActionManifest.decodeResult`, records every input the code actually reads
(`ActionInput.recording` while `parseInputs` and `pre.ts`'s
`readAppCredentials` run) and every output it actually writes
(`ActionOutputs.recording()` while `program` runs its failure path), and
asserts `ActionManifest.diff` finds no declared input unread, no read input
undeclared, and the same for outputs.[^action-contract-test] A rename on
either side then fails naming the input. That test is the only mechanism in
the repository that would fail here — nothing else notices. Its one blind
spot is inherited from recording: it sees only reads on the path the
recorded run takes, so an input read solely on some other branch is
invisible to it.

## Related

[keep-the-action-contract-in-sync](../conventions/keep-the-action-contract-in-sync.md)
states the rule this gotcha explains the consequence of breaking;
[action-contract](../models/action-contract.md) documents the `contract.ts`
source of truth the recording test is checked against.

[^inputs]: `../../src/inputs.ts`
[^action-contract-test]: `../../__test__/action-contract.test.ts`
