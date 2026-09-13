---
title: No sticky PR comment in pr mode
description: pr mode writes only the job summary; a sticky, updatable PR comment was anticipated but is not implemented.
type: Limitation
bounds: ../modules/marketplace-manager.md
tags: [observability]
generated:
  by: okfit/claude-code
sources:
  - id: program
    resource: ../../src/program.ts
    last_modified: 2026-09-13T00:00:00Z
  - id: pull-request-comment
    resource: ../../.repos/effected/packages/github/src/PullRequestComment.ts
    last_modified: 2026-09-13T00:00:00Z
---

# No sticky PR comment in pr mode

## Condition

The action runs in `pr` mode and produces a report.

## Symptom

`emit` writes the structured `result` output, the convenience scalars, and a
job summary via `outputs.summary(buildSummary(output))` — and nothing
else.[^program] No comment is posted on the pull request the run opened or
updated, sticky or otherwise, even though `pr-title`/`pr-body` inputs exist
and a per-run comment was anticipated as a way to surface the same report on
the PR itself rather than only in the job summary. A reviewer working from the
PR page sees no run-produced comment at all.

## What implementing it would take

`@effected/github` already ships the resource for this:
`PullRequestComment`.[^pull-request-comment] Its `upsert(issueNumber, marker,
body)` finds a previously-posted comment by a caller-supplied `CommentMarker`
(a namespace + key rendered as a hidden HTML comment) and either patches it in
place or creates it, which is exactly the "sticky" shape — one comment per PR
that later runs update rather than multiply. `find` paginates rather than
reading a single page, so the marker is not lost on a busy PR.

Adding it would mean: composing `PullRequestComment.layer` into `MainLive`
alongside the other resource layers built from the same client; picking a
`CommentMarker` (e.g. namespace `marketplace-manager`, a fixed key); calling
`upsert` with a body built from the same report data `buildSummary` already
projects, from the `pr`-mode branch of `runOrchestration`, after `land`
returns the PR number; and treating the write as non-fatal (`logWarning` on
failure) the same way the job summary write already is.

None of this exists in `program.ts` today — the `pr`-mode path stops at
`emit`, which is mode-agnostic and never reads `result.prNumber` to address a
comment.[^program]

[^program]: `../../src/program.ts`
[^pull-request-comment]: `../../.repos/effected/packages/github/src/PullRequestComment.ts`
