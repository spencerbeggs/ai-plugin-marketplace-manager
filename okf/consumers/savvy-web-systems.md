---
type: Consumer
title: savvy-web/systems
description: A workflow that repins Claude Code plugins via this action on manual dispatch or a repository_dispatch event. Still runs v1; a v2 migration is pending.
repository: savvy-web/systems
status: stable
generated:
  by: okfit/claude-code
  at: 2026-09-29T03:16:59Z
  body_sha256: e647862c767450dfc487b3327a32ea2702fbcfdd49a02202a8c4ad2bb1700a12
---

# savvy-web/systems

`savvy-web/systems`'s `.github/workflows/repin-plugins.yml` calls
`spencerbeggs/claude-code-marketplace-manager@v1` from a `repin` job,
triggered by `workflow_dispatch` (with `name`/`sha`/`path`/`json` inputs) or
by a `repository_dispatch` event of type `plugin-release`. Structurally this
workflow is byte-identical to
[spencerbeggs/bot](spencerbeggs-bot.md)'s.

## v2 migration pending

This workflow still calls the action at `@v1` and still edits only the
Claude Code manifest; the rename to `spencerbeggs/ai-plugin-marketplace-manager@v2`
and the addition of a `marketplace` input are follow-up work in this
consumer's own repository, not part of the v2 implementation itself. `@v1`
keeps resolving through the repository-rename redirect in the meantime.

## Surfaces exercised

- **Inputs:** `app-client-id`, `app-private-key` (from repository secrets),
  and all four manual/`json` surfaces — `name`, `sha`, `path`, `json` —
  sourced from either the `workflow_dispatch` inputs or the
  `repository_dispatch` client payload depending on which event fired the
  run.
- **Mode:** `mode: "commit"` — direct-to-base, not `pr`. An `auto-merge`
  line is present but commented out, with the same note as
  [spencerbeggs/bot](spencerbeggs-bot.md) about a `main`-branch ruleset
  restricting auto-merge to `squash`.
- **Checkout:** `actions/checkout@v7` with `fetch-depth: 0`, no explicit ref
  and no `base-branch` input, so the action resolves the repo's default
  branch itself (`src/services/ManifestCommitter.ts:44-45`).

## Edge

The edge sits at the workflow boundary: this consumer owns triggering and
concurrency (`concurrency: { group: repin-plugins, cancel-in-progress:
false }`), and hands the action only the resolved
`name`/`sha`/`path`/`json` values plus mode/credentials. The action owns
everything from manifest read through validation to the landed commit.
