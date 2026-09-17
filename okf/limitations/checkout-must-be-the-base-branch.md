---
title: Checkout must be the base branch
description: base-branch pointed at a ref other than the checked-out one produces a tree derived from the wrong ref.
type: Limitation
status: stable
bounds: ../interfaces/action-inputs.md
tags: [ci]
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: 048cec1e1a41c3786d8fd174a14d8b3a0201611af9f91b094150af67db43b27c
sources:
  - id: manifest-editor
    resource: ../../src/services/ManifestEditor.ts
    last_modified: 2026-09-13T00:00:00Z
  - id: program
    resource: ../../src/program.ts
    last_modified: 2026-09-13T00:00:00Z
---

# Checkout must be the base branch

## Condition

The `base-branch` input (or the resolved repo default branch, when the input
is unset) names a ref other than the one the runner actually checked out
before this action ran.

## Symptom

`readManifest` reads the manifest text straight from the local
filesystem — `fs.readFileString(path)` against the checkout, with no
reference to any git ref at all.[^manifest-editor] `runOrchestration` calls it
first, before any branch name is resolved: `resolveBaseBranch` only runs later,
to pick the branch `land` commits or opens a PR against.[^program] Nothing in
between compares the two. So the edited text — and therefore the tree in the
resulting commit or PR — is derived from whatever the checkout happened to
have on disk, not from `base-branch`. If the checkout is behind, ahead of, or
simply a different ref than `base-branch`, the landed change is built on the
wrong starting point while every downstream step (diff, no-op guard,
validation) proceeds as though it were correct.

## Why this is unaddressed

This is a pre-existing hazard, not one this design introduced or has closed.
There is no runtime check that ties the checkout's `HEAD` to `base-branch`.

## What a fix would take

Either of two structural changes would close it:

- Read the manifest through the GitHub API at the `base-branch` sha (via the
  same `GitCommit`/`Repo` services `land` already uses for `pr` mode) instead
  of from the local checkout, so the edited text is always derived from the
  named ref regardless of what is on disk.
- Or verify, before `readManifest` runs, that the checkout's current `HEAD`
  resolves to the same commit as `base-branch` (or the resolved default
  branch), and fail with a typed error when it does not.

Neither exists in `runOrchestration` today; the ordering in
`program.ts`[^program] resolves `base-branch` only for landing, never for the
read.

[^manifest-editor]: `../../src/services/ManifestEditor.ts`
[^program]: `../../src/program.ts`
