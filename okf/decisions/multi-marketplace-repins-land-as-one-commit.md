---
type: Decision
title: Multi-marketplace repins land as one commit, not one per file
description: A run that touches both the Claude Code and Copilot manifests lands every change in a single commit (or a single PR head move); one commit per touched file was rejected because pr mode re-roots the head branch on every run.
status: stable
tags:
  - architecture
  - ci
sources:
  - id: committer
    resource: ../../src/services/ManifestCommitter.ts
    title: "land() maps every validated change to one FileContent in one tree"
  - id: program
    resource: ../../src/program.ts
    title: "per-marketplace loop accumulates into one validated array before land runs"
  - id: pr-head-reroot
    resource: ../decisions/pr-head-rerooted-in-one-ref-move.md
    title: "why a second GitBranch.upsert in the same run is unsafe"
  - id: design-spec
    resource: ../../docs/superpowers/specs/2026-09-23-v2-multi-marketplace-design.md
    title: "Intent and §3 Landing"
generated:
  by: okfit/claude-code
  at: 2026-09-23T20:44:15Z
verified:
  - by: human:spencer
    at: 2026-11-01T19:17:03Z
integrity:
  generated:
    body: 26a7a1ac221e67a6
  verified:
    by: human:spencer
    at: 2026-11-01T19:17:03Z
    content: 51100dbe78653916
---

# Multi-marketplace repins land as one commit, not one per file

## Context

v2 can target either or both of two fixed-path manifests
(`.claude-plugin/marketplace.json`, `.github/plugin/marketplace.json`) from
one run. Each targeted manifest is read, edited, and validated
independently (`src/program.ts`'s per-marketplace loop over
`MARKETPLACE_ORDER`), producing a `ValidatedManifestChange` per file. The
question this decision answers is how those changes reach the repository:
as one commit covering every touched file, or as one commit per file.

`pr` mode already force-resets its head branch onto base's current tip on
every run, expressed as a single `GitBranch.upsert` straight to an
already-built commit — deliberately not `reset` then `commit`, because that
sequence leaves the head branch momentarily equal to base and an open PR
with an empty diff gets auto-closed by GitHub
[pr-head-rerooted-in-one-ref-move](pr-head-rerooted-in-one-ref-move.md).

## Decision

Every manifest a run's patches touch is landed in **one** commit (`commit`
mode) or one PR head move (`pr` mode). `LandParams.changes` is a
non-empty array of `ValidatedManifestChange`, one per touched file;
`land` maps the whole array to one `FileContent` per file and builds one
tree, one commit, and (in `pr` mode) one `GitBranch.upsert` call — see
[landing-requires-a-validated-non-noop-change](../invariants/landing-requires-a-validated-non-noop-change.md).

## Alternatives rejected

- **One commit per touched manifest.** In `pr` mode this means a second
  `GitBranch.upsert` in the same run, each one re-rooting the head branch
  at base's *then-current* tip. The second `upsert` would re-root onto a
  tip that no longer includes the first commit (base itself never moves
  within one run), discarding it — the same shape of loss
  [pr-head-rerooted-in-one-ref-move](pr-head-rerooted-in-one-ref-move.md)
  exists to prevent for a *stale* branch, reproduced here *within* a single
  run instead of across runs. Sequencing the two `upsert` calls so the
  second is rooted on the first's result would work, but produces two
  separate commits for what a caller experiences as one change, and doubles
  the auto-merge and PR-body bookkeeping for no benefit `commit` mode
  cannot already provide.
- **One PR per marketplace.** Rejected for the same reason plus a
  proliferation-of-PRs cost: a caller repinning one plugin in both
  marketplaces would review two PRs for one intent.

## Consequences

- `commitSubject`/`messageBody` describe every touched `(marketplace,
  name)` pair in one message, not one message per manifest — see
  [result-output](../interfaces/result-output.md).
- A failure validating the *second* targeted manifest means *nothing*
  lands, even though the first validated cleanly — all-or-nothing across
  files is a consequence of landing atomically, not a separate policy.
- Adding a third marketplace kind changes nothing about landing: it is
  still one more `FileContent` in the same array, one more entry in the
  same commit.
