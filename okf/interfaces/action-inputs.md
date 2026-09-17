---
type: Interface
title: Action Inputs
description: The consumer-side input contract for the action's manual and json paths.
kind: config
resource: ../../action.yml
status: stable
generated:
  by: okfit/claude-code
  at: 2026-09-17T19:20:18Z
  body_sha256: 017455cd6bbf7ab2b56746f164f59c2cfe68bda2b1015c9a765115b0c2c50e7f
tags:
  - architecture
  - dx
---

# Action Inputs

## The manual/`json` XOR

A caller picks exactly one of two input paths; `src/inputs.ts` enforces this
before anything else runs.

- **manual**: `name` plus at least one of `url`/`path`/`sha`. `name` alone,
  with none of `url`/`path`/`sha` set, is an `InvalidInputError` — the manual
  path requires a field to change
  (`src/inputs.ts:84-91`).
- **json**: a single JSON object with a `plugins[]` array of per-plugin
  partial-merge patches, each naming an existing plugin and changing only the
  fields it supplies (`action.yml:29-36`). Example, from the manifest's own
  description:

  ```json
  { "plugins": [{ "name": "vitest-agent", "sha": "8cba76025762cfa1dca24e6daafe2e3dc7c14924" }] }
  ```

  Its schema is `schemas/1.0/input.json` (`$id` declared at
  `schemas/1.0/input.json:3`, generated from `src/schema/input.ts`'s
  `JsonInput` by `@effected/schemastore-cli`), published at
  `https://raw.githubusercontent.com/spencerbeggs/claude-code-marketplace-manager/main/schemas/1.0/input.json`
  — `INPUT_SCHEMA_URL` (`src/schema/input.ts:52`); see
  [effect-schemas](../models/effect-schemas.md).

Providing both the manual fields and `json` is an error, and providing
neither is an error — `hasManual && hasJson` and `!hasManual && !hasJson` are
both rejected before either path is decoded (`src/inputs.ts:53-65`). Both
paths decode through the same `decodeJsonInput` schema, so a manual patch
gets identical validation (e.g. the `sha` 40-hex pattern) and error shape as
a `json` patch (`src/inputs.ts:92-108`). Either path normalizes to
`ParsedInputs.patches`, the one array the rest of the action reads
(`src/inputs.ts:13-14`, `67-109`).

## Other inputs

| Input | Default | Behavior |
| --- | --- | --- |
| `mode` | `"commit"` | `commit` (direct to base branch) or `pr`; anything else is an `InvalidInputError` (`action.yml:37-40`; `src/contract.ts:82`; `src/inputs.ts:111-114`). |
| `base-branch` | *(unset)* | Empty ⇒ resolved at runtime to the repository's default branch via `GitHubRepository.defaultBranch` (`action.yml:41-44`; `src/services/ManifestCommitter.ts:43-44`). |
| `branch` | `"chore/repin-plugins"` | PR head branch (`pr` mode); force-reset onto base on every run (`action.yml:45-48`; `src/contract.ts:83`). |
| `commit-message` | *(unset)* | Empty ⇒ generated from the applied changes plus the DCO trailer (`action.yml:49-52`; `src/inputs.ts:118`; `src/program.ts:120`). |
| `pr-title` | *(unset)* | Empty ⇒ generated `commitSubject` (`action.yml:53-56`; `src/inputs.ts:119`; `src/program.ts:121`). |
| `pr-body` | *(unset)* | Empty ⇒ generated `messageBody` (`action.yml:57-60`; `src/inputs.ts:120`; `src/program.ts:122`). |
| `auto-merge` | `"rebase"` | `merge`\|`squash`\|`rebase`, validated (`src/inputs.ts:122-127`); applied via a separate `PullRequest.setAutoMerge` call issued after `PullRequest.upsert`, so an auto-merge failure is never reported as though opening the PR had failed (`src/services/ManifestCommitter.ts:139-147`); has no effect in `commit` mode, since `land` only reaches that branch in `pr` mode (`action.yml:61-66`; `src/contract.ts:84`). |
| `dry-run` | `"false"` | Validate and emit `summary`/`result`, but make no commit or PR (`action.yml:67-70`; `src/contract.ts:85`; `src/inputs.ts:133`). |
| `app-client-id` | *(required)* | GitHub App client ID, read in `pre.ts` (`action.yml:71-73`; `src/pre.ts:38`). |
| `app-private-key` | *(required)* | GitHub App private key (PEM), read via `ActionInput.redacted` and stays `Redacted` end to end (`action.yml:74-76`; `src/pre.ts:39`). |

`mode`, `branch`, `auto-merge`, and `dry-run` are exactly the inputs mirrored
in `src/contract.ts`'s `INPUT_DEFAULTS`, because they are the only ones whose
manifest default is not the empty string
(`src/contract.ts:67-86`) — see
[action-contract](../models/action-contract.md).
