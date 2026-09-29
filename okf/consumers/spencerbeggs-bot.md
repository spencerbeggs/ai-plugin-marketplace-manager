---
type: Consumer
title: spencerbeggs/bot
description: A workflow that repins Claude Code plugins via this action on manual dispatch or a repository_dispatch event. Still runs v1; a v2 migration is pending.
repository: spencerbeggs/bot
status: stable
generated:
  by: okfit/claude-code
  at: 2026-09-29T03:16:59Z
  body_sha256: ba60c9aa14447b2c3bc01c80ba4b0592327e13c8030f22708eaa1ec7fd814a05
sources:
  - id: owner-plan
    resource: conversation with the repository owner
    title: "v2 design doc's consumer follow-up list"
    last_modified: 2026-09-23T00:00:00Z
---

# spencerbeggs/bot

`spencerbeggs/bot`'s `.github/workflows/repin-plugins.yml` calls
`spencerbeggs/claude-code-marketplace-manager@v1` from a `repin` job
triggered by `workflow_dispatch` (with `name`/`sha`/`path`/`json` inputs) or
by a `repository_dispatch` event of type `plugin-release`.

## Surfaces exercised

- **Inputs:** `app-client-id`, `app-private-key` (from repository secrets),
  and all four manual/`json` surfaces — `name`, `sha`, `path`, `json` — each
  sourced from either the `workflow_dispatch` inputs or the
  `repository_dispatch` client payload, whichever event fired the run. Which
  of the manual fields or `json` is actually non-empty at runtime therefore
  depends on the caller of `workflow_dispatch` or the payload of the
  dispatched event, not on anything this workflow itself decides.
- **Mode:** `mode: "commit"` — direct-to-base, not `pr`. An `auto-merge`
  line is present but commented out, with a note that the repo's `main`
  branch ruleset restricts PRs to `allowed_merge_methods: [squash]` and
  would reject `rebase`/`merge` auto-merge at runtime — relevant only if
  this consumer switches to `pr` mode.
- **Checkout:** `actions/checkout@v7` with `fetch-depth: 0`, no explicit ref
  — the default branch is checked out, and no `base-branch` input is set, so
  the action resolves the repo's default branch itself
  (`src/services/ManifestCommitter.ts:44-45`).

## Edge

The edge sits at the workflow boundary: this consumer owns triggering
(`workflow_dispatch` shape, `repository_dispatch` payload mapping) and
concurrency (`concurrency: { group: repin-plugins, cancel-in-progress:
false }`), and hands the action only the resolved `name`/`sha`/`path`/`json`
values plus mode/credentials. The action owns everything from manifest read
through validation to the landed commit.

## v2 migration pending

This workflow still calls the action at `@v1` and edits only the Claude
Code manifest. The planned follow-up, in this consumer's own repository and
not part of the v2 implementation itself, is: rename the workflow to "Repin
Plugins", move the `uses:` reference to
`spencerbeggs/ai-plugin-marketplace-manager@v2`, and add and forward a
`marketplace` input alongside the existing `name`/`sha`/`path`/`json`
surfaces.[^owner-plan] `@v1` keeps resolving through the repository-rename
redirect in the meantime.

## Historical observation

This consumer's PR #12 reached `mergeable: "CONFLICTING"` before the
pr-mode head-branch reset existed — the fixed `chore/repin-plugins` head
branch accumulated commits against an increasingly stale base across
repeated runs until GitHub could no longer merge it cleanly. This consumer
currently runs in `commit` mode, which does not exercise that code path;
see [pr-head-rerooted-in-one-ref-move](../decisions/pr-head-rerooted-in-one-ref-move.md)
for the fix and
[pr-head-branch-is-action-owned](../limitations/pr-head-branch-is-action-owned.md)
for the accepted consequence in `pr` mode.

[^owner-plan]: conversation with the repository owner
