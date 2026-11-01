---
title: marketplace looks like a manual-path signal and isn't
description: A non-empty marketplace input looks like proof a caller is using the manual path, but it is deliberately excluded from that detection — because a defaulted workflow_dispatch choice input is always non-empty.
type: Gotcha
status: stable
resource: ../../src/inputs.ts
stale_after: 2027-03-23T00:00:00Z
tags: [dx, testing]
sources:
  - id: inputs
    resource: ../../src/inputs.ts
    last_modified: 2026-09-23T00:00:00Z
  - id: design-spec
    resource: ../../docs/superpowers/specs/2026-09-23-v2-multi-marketplace-design.md
    title: "§1 Rules — manual-path detection"
generated:
  by: okfit/claude-code
  at: 2026-09-23T20:44:15Z
integrity:
  generated:
    body: c373473075213c08
---

# `marketplace` looks like a manual-path signal and isn't

## What a reader sees

`marketplace` is required on the manual path — a manual patch with no
`marketplace` fails with `InvalidInputError`. A reader skimming
`parseInputs` for what decides "this run is manual" would reasonably expect
`marketplace.length > 0` to be one of the conditions, alongside `name`,
`sha`, and `path`.

## What they conclude

Since a `workflow_dispatch` form's `marketplace` choice input is populated
whenever the workflow runs manually, treating it as a manual-path signal
seems harmless — surely it is simply *another* field that is non-empty on
the manual path and empty on the `json` path, like the other three.

## What is true

`hasManual` is computed from `name`, `path`, and `sha` only — `marketplace`
is deliberately excluded, and the exclusion is load-bearing rather than an
oversight (`src/inputs.ts`). A `workflow_dispatch` `choice` input very
commonly carries a `default` (for example `default: claude-code`), and a
defaulted choice input is *never* empty at the point `inputs.marketplace`
is read — GitHub Actions fills it with the default whether or not the
person triggering the run touched that field. A consumer workflow that
forwards `marketplace: ${{ inputs.marketplace }}` unconditionally to every
dispatch (manual or `json`-carrying) would therefore always supply a
non-empty `marketplace`, even on a run whose actual intent is the `json`
path. If `hasManual` counted `marketplace`, every such `json` run would
also satisfy `hasManual`, and the XOR check would reject it as "both manual
and json supplied" — a spurious `InvalidInputError` on a completely valid
`json` run, caused by nothing the caller did wrong.

The fix is not to strip `marketplace` from the dispatch payload before
calling this action — that would just move the problem to the caller. It is
that `parseInputs` never looks at `marketplace` to decide *which* path is
active; it only requires `marketplace` once the manual path is already
known to be active by the other three fields.

## Related

[action-inputs](../interfaces/action-inputs.md) documents the full
manual/`json` XOR this exclusion is part of.
