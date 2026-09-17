---
type: Consumer
title: savvy-web/systems
description: A workflow that repins Claude Code plugins via this action on manual dispatch or a repository_dispatch event.
repository: savvy-web/systems
status: stable
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: ea272896e941347876b9a96a53d0b790e294d5398249868c02bf9bd3aed7de9e
---

# savvy-web/systems

`savvy-web/systems`'s `.github/workflows/repin-plugins.yml` calls
`spencerbeggs/claude-code-marketplace-manager@v1` from a `repin` job,
triggered by `workflow_dispatch` (with `name`/`sha`/`path`/`json` inputs) or
by a `repository_dispatch` event of type `plugin-release`. Structurally this
workflow is byte-identical to
[spencerbeggs/bot](spencerbeggs-bot.md)'s.

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
  branch itself (`src/services/ManifestCommitter.ts:43-44`).

## Edge

The edge sits at the workflow boundary: this consumer owns triggering and
concurrency (`concurrency: { group: repin-plugins, cancel-in-progress:
false }`), and hands the action only the resolved
`name`/`sha`/`path`/`json` values plus mode/credentials. The action owns
everything from manifest read through validation to the landed commit.
