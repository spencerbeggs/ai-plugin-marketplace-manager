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
  at: 2026-09-13T21:33:34Z
  body_sha256: 5aa5597d7adf84de3a96f819da26e47e11f83f0804680ae5625d4af8d877ae89
sources:
  - id: inputs
    resource: ../../src/inputs.ts
    last_modified: 2026-09-13T00:00:00Z
  - id: action-contract-test
    resource: ../../__test__/action-contract.test.ts
    last_modified: 2026-09-13T00:00:00Z
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

Every input read goes through `ActionInput.string("name")` (or `.boolean`),
each keyed by a bare string literal — there is no shared enum or union type
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
`__test__/action-contract.test.ts`: it decodes `action.yml`, and for every
name in `INPUT_NAMES`/`OUTPUT_NAMES` asserts by regex that some
`ActionInput.\w+(name)` (or `outputs.set...(name`) call exists somewhere in
the concatenated source of `src/inputs.ts`, `src/pre.ts`, and
`src/program.ts`.[^action-contract-test] That test is the only mechanism in
the repository that would fail here — nothing else notices.

## Related

[keep-the-action-contract-in-sync](../conventions/keep-the-action-contract-in-sync.md)
states the rule this gotcha explains the consequence of breaking;
[action-contract](../models/action-contract.md) documents the `contract.ts`
source of truth the regex test is checked against.

[^inputs]: `../../src/inputs.ts`
[^action-contract-test]: `../../__test__/action-contract.test.ts`
