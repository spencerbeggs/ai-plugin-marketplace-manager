---
type: Decision
title: PR head re-rooted onto base in one ref move
description: Every pr-mode run re-roots the head branch at base's current tip, unconditionally, and does so as a single GitBranch.upsert to the already-built commit.
status: draft
tags:
  - architecture
  - ci
sources:
  - id: committer
    resource: ../../src/services/ManifestCommitter.ts
    title: "land() builds the commit before moving the ref"
  - id: test-b5
    resource: ../../__test__/services/ManifestCommitter.test.ts
    title: "B5: re-rooting tests"
  - id: gitbranch-kit
    resource: ../../.repos/effected/packages/github/src/GitBranch.ts
    title: "GitBranch.upsert TSDoc documents the empty-diff auto-close defect"
  - id: owner-ruling
    resource: 'conversation with the repository owner'
    title: "user ruling: do not restore parity"
generated:
  by: okfit/claude-code
---

# PR head re-rooted onto base in one ref move

## Context

The `branch` input for `pr` mode defaults to a fixed name
(`chore/repin-plugins`) reused run over run. If the head branch is left where
an earlier run put it, each subsequent run's commit stacks on an ever-staler
base until the PR becomes unmergeable — this was observed directly:
`spencerbeggs/bot` PR #12 reached `mergeable: "CONFLICTING"`. The head branch
therefore has to be re-rooted at base's current tip on every `pr`-mode run.

A second, sharper problem sits underneath that: the obvious way to re-root —
reset the head branch onto base, then commit to it — is documented as a live
defect against `@effected/github`'s `GitBranch.upsert`. Between those two
calls the head branch *is* base, so any open PR from it has a momentarily
empty diff, and GitHub auto-closes a PR whose diff is empty. This action is
named directly as the consumer whose four-round-trip `getSha` → `exists` →
`create` → re-`exists` → `reset` dance the `upsert` API was built to
replace, and the same TSDoc records that a consumer lost a release PR to
that ~3-second window while its run reported success[^gitbranch-kit].

## Decision

Two parts of one decision:

1. **Re-root the head branch at base's current tip on every `pr`-mode run,
   unconditionally — not gated on detecting an open PR.** `branch.sha(base)`
   is read on every `pr`-mode run regardless of PR state. A stale branch
   whose PR was already closed is precisely the case that most needs
   re-rooting, so gating the reset on "is there an open PR" would skip the
   run that needs it most.
2. **The re-root and the commit are one `GitBranch.upsert` call, made once,
   straight to the already-built commit.** `land` builds the tree and commit
   against base first — `branch.sha(base)` → `commit.get(baseSha)` →
   `commit.createTree({ changes, baseTree })` →
   `commit.createCommit({ message, tree, parents: [baseSha] })` — and only
   then calls `branch.upsert(head, sha)` exactly once[^committer]. The head
   ref never rests on the bare base head at any point observable from
   outside the run, so no open PR sees an empty diff.

**This was a user ruling, not an implementer's choice[^owner-ruling].** The
port that produced this codebase was otherwise run under a strict parity
contract with the pre-port implementation. This decision is a deliberate,
explicitly sanctioned deviation from that parity contract, made because the
pre-port ordering (`reset` then `commitFiles`) was itself the defect. Do not
"restore parity" here — the pre-port sequence is the bug, not the baseline.

## Alternatives rejected

- **`reset(head, baseSha)` then `commitFiles(head)` (the pre-port sequence).**
  Rejected because of the empty-diff auto-close window described above: it
  produces a brief state where head equals base, and GitHub auto-closes any
  open PR whose diff evaluates to empty during that window.
- **Gating the re-root on detecting an open PR.** Rejected because a branch
  whose PR was already closed by a prior run's defect is exactly the branch
  most in need of being re-rooted; gating on PR state would leave a
  known-stale branch untouched.
- **`getSha` → `exists` → `create` → on-failure `exists` → `reset`, the
  pre-port four-round-trip dance.** Superseded by `GitBranch.upsert`, which
  recognizes a concurrent creator structurally through `kind: "alreadyExists"`
  rather than by matching error prose, and resets rather than inheriting a
  branch a concurrent creator rooted elsewhere.

## Consequences

- **A human commit pushed onto the `pr`-mode head branch is discarded** on
  the next run. That branch is action-owned by design; no input protects a
  commit landed there by a human.
- **The reset can never produce an empty diff**, because `land` is only
  reached once the no-op guard upstream has already proven the edit differs
  from the manifest on base. No PR close/reopen handling is needed as a
  result.
- The end state — head branch rooted at base's current tip, carrying exactly
  one commit — is unchanged from the pre-port behavior; only the call
  ordering differs. Because the reset is implicit inside a single `upsert`
  call rather than a separate visible step, it is exactly the kind of
  invariant that could quietly lose its test coverage in a refactor. Two
  tests pin it directly: `B5: a stale head branch is re-rooted at base's
  CURRENT tip, not stacked onto` and `B5: a second run discards the first
  run's commit rather than stacking on it`[^test-b5].

[^committer]: `services/ManifestCommitter.ts` — `land()`
[^test-b5]: `__test__/services/ManifestCommitter.test.ts`
[^gitbranch-kit]: `@effected/github`'s `GitBranch.upsert` TSDoc
[^owner-ruling]: conversation with the repository owner
