---
title: The pr-mode head branch is action-owned
description: A commit pushed onto the fixed pr-mode head branch is discarded on the next run, by design.
type: Limitation
status: stable
bounds: ../modules/marketplace-manager.md
tags: [ci]
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: b68019384ee5dcae21cb36a188223dfc51a76000e1403ba175eb1a39de5594ae
sources:
  - id: manifest-committer
    resource: ../../src/services/ManifestCommitter.ts
    last_modified: 2026-09-13T00:00:00Z
---

# The pr-mode head branch is action-owned

## Condition

A human (or another process) pushes a commit onto the `pr`-mode head branch —
the `branch` input, which defaults to the fixed name `chore/repin-plugins` and
is reused run over run.[^manifest-committer]

## Symptom

The next `pr`-mode run discards that commit. `land` re-roots the head branch
at base's *current* tip on every run: it builds the tree and commit against
base first, then moves the ref with a single `GitBranch.upsert(branch, sha)`
straight to the finished commit — there is no step that preserves or merges
whatever the branch pointed at before.[^manifest-committer] Nothing reads the
branch's prior contents before overwriting it.

## Why this is acceptable

Without an unconditional reset, the fixed branch name accumulates commits
against an ever-staler base until the PR becomes unmergeable — the failure
mode this design replaced. The reset is unconditional rather than gated on an
open PR because a stale branch whose PR was already closed is exactly the case
that most needs re-rooting, and `land` is only reached once the no-op guard
has already proven the edit differs from base, so the reset can never produce
an empty diff.[^manifest-committer]

No input guards this: `branch` selects *which* fixed name is action-owned, not
*whether* it is. A human who wants to preserve manual commits needs a branch
name the action never touches — not the `branch` input pointed at the same
name it currently uses.

## Related

The single-`upsert` ordering that makes each reset safe (rather than briefly
resting the head at base and auto-closing an open PR) is
[pr-head-rerooted-in-one-ref-move](../decisions/pr-head-rerooted-in-one-ref-move.md).

[^manifest-committer]: `../../src/services/ManifestCommitter.ts`
