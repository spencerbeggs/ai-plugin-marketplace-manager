---
title: A pr-mode head carries exactly one commit, rooted at base
description: After a pr-mode run the head branch is re-rooted at base's current tip and carries exactly one commit; the ref never rests on the bare base head.
type: Invariant
resource: ../../__test__/services/ManifestCommitter.test.ts
stale_after: 2027-03-13T00:00:00Z
tags:
  - ci
  - testing
sources:
  - id: manifest-committer
    resource: ../../src/services/ManifestCommitter.ts
  - id: manifest-committer-test
    resource: ../../__test__/services/ManifestCommitter.test.ts
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: f8ee4dd03cdd3280a5c945051471f09cd70253cbef77bdb344894c15c6a2ee6f
---

# A pr-mode head carries exactly one commit, rooted at base

**Property.** After a `pr`-mode `land`, the head branch is rooted at
base's *current* tip — never at whatever the head branch pointed at
before the run — and carries exactly one new commit. The ref is never
observed resting on the bare base head at any point during the run.

**Mechanism.** `land`'s `pr` branch builds the finished commit before
touching the head ref: it reads base's sha, gets that commit for its
`treeSha`, builds a tree on it, and creates the commit with base's sha as
its sole parent — all before any ref move. Only then does it call
`GitBranch.upsert(params.branch, sha)` exactly once, straight to the
finished sha.[^manifest-committer] Because the head branch is moved with a
single `upsert` to an already-built commit, rather than an `upsert` to
base's head followed by a separate commit call, the head branch is never
briefly equal to base — the shape that gets an open PR auto-closed for an
empty diff.

Two tests prefixed `B5:` pin this against a stale or drifted head branch.
The first seeds a head branch at a "drifted" sha behind base's current tip
and asserts the new commit's parent is base's current tip, never the
drifted one, and that the stale tip is discarded outright — one commit,
one ref move.[^manifest-committer-test] The second runs `land` twice
against the same branch name and asserts the second run's commit parents
base directly rather than stacking onto the first run's commit — one
commit per run, not a growing stack.[^manifest-committer-test]

**What a refactor would have to break.** Splitting the single `upsert`
into a reset-to-base-head step followed by a separate commit call would
reintroduce the window where the head branch equals base — silently
reopening the empty-diff auto-close failure mode these tests are built to
catch. Either `B5` test would also fail if a refactor stacked a new commit
onto the existing head branch's tip instead of re-rooting at base's
current tip, since both assert the parent is base's sha and explicitly
assert the stale/prior tip is *not* among the parents.

See `../decisions/pr-head-rerooted-in-one-ref-move.md` for the rejected
alternatives and the rationale behind building the commit before moving
the ref.

[^manifest-committer]: The base-first build followed by the single
    `GitBranch.upsert` is at `../../src/services/ManifestCommitter.ts:125-137`.
[^manifest-committer-test]: "B5: a stale head branch is re-rooted at
    base's CURRENT tip, not stacked onto" is at
    `../../__test__/services/ManifestCommitter.test.ts:272-291`; "B5: a
    second run discards the first run's commit rather than stacking on
    it" is at `../../__test__/services/ManifestCommitter.test.ts:293-311`.
