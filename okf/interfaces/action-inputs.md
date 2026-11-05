---
type: Interface
title: Action Inputs
description: The consumer-side input contract for the action's manual and json paths.
kind: config
resource: ../../action.yml
status: stable
generated:
  by: okfit/claude-code
  at: 2026-11-05T23:25:35Z
tags:
  - architecture
  - dx
integrity:
  generated:
    body: 17e628fef6d07ab6
---

# Action Inputs

## The manual/`json` XOR

A caller picks exactly one of two input paths; `src/inputs.ts` enforces this
before anything else runs.

- **manual**: `name` + `marketplace` + `sha` (`path` optional). Manual-path
  *detection* looks only at `name`, `sha`, and `path` — **never**
  `marketplace`. A `workflow_dispatch` choice input for `marketplace` is
  routinely given a `default`, so it is non-empty on every run, `json`-only
  runs included; counting it toward `hasManual` would turn those into
  spurious XOR violations (`src/inputs.ts`). See
  [marketplace-input-ignored-for-manual-path-detection](../gotchas/marketplace-input-ignored-for-manual-path-detection.md).
  Once a run is known to be manual, `marketplace` and `sha` are each
  required — `name` alone, or `name` + `marketplace` without `sha`, is an
  `InvalidInputError`.
- **json**: a single JSON object with a `plugins[]` array of patches, each
  naming an existing entry in one marketplace and setting `sha` (and
  optionally `path`). Example:

  ```json
  {
    "plugins": [
      { "name": "effected", "marketplace": "claude-code", "sha": "8cba76025762cfa1dca24e6daafe2e3dc7c14924" },
      { "name": "effected", "marketplace": "copilot", "sha": "8cba76025762cfa1dca24e6daafe2e3dc7c14924", "path": "plugins/copilot" }
    ]
  }
  ```

  `plugins` must be non-empty, and a `(marketplace, name)` pair may appear
  at most once per run (`src/inputs.ts`'s `rejectDuplicates`). A v1 payload
  carrying `url` on any entry is rejected by name — `rejectLegacyUrl` runs
  before the generic decode specifically so a sender still on v1 gets a
  message naming `url` rather than a generic schema error
  (`src/inputs.ts`). The decoder also runs with `onExcessProperty: "error"`
  (`src/schema/input.ts`'s `decodeJsonInput`), so any other stray key fails
  the same way instead of being silently stripped. Its schema is
  `schemas/2.0/input.json` (generated from `src/schema/input.ts`'s
  `JsonInput` by `effected schema`), published at
  `https://raw.githubusercontent.com/spencerbeggs/ai-plugin-marketplace-manager/main/schemas/2.0/input.json`
  — `INPUT_SCHEMA_URL`; see [effect-schemas](../models/effect-schemas.md).

Providing both the manual fields and `json` is an error, and providing
neither is an error — both are rejected before either path is decoded.
Both paths decode through the same `decodeJsonInput` schema (a manual patch
becomes a one-element `plugins` array), so a manual patch gets identical
validation (the `sha` 40-hex pattern, the `marketplace` literal) and error
shape as a `json` patch. Either path normalizes to `ParsedInputs.patches`,
the one array the rest of the action reads.

`JsonInput.plugins` is `Schema.NonEmptyArray(PluginPatch)`: an empty
`plugins: []` is rejected at decode, and the published
`schemas/2.0/input.json` carries it as a plain `minItems: 1`.

## The marketplace input

`marketplace` is `claude-code` or `copilot`; it names which fixed manifest
path (`.claude-plugin/marketplace.json` or `.github/plugin/marketplace.json`)
a manual patch targets. It carries no path of its own and there is no
per-marketplace path input — see
[fixed-manifest-paths-per-marketplace](../decisions/fixed-manifest-paths-per-marketplace.md).
There is no `url` input at all; only `path` and `sha` can be repinned — see
[url-and-schema-version-dropped](../decisions/url-and-schema-version-dropped.md).

## Other inputs

| Input | Default | Behavior |
| --- | --- | --- |
| `mode` | `"commit"` | `commit` (direct to base branch) or `pr`, read with `ActionInput.literals`; anything else is a `ConfigError` naming the input, the value, and the allowed set (`action.yml`; `src/contract.ts`; `src/inputs.ts`). |
| `base-branch` | *(unset)* | Empty ⇒ resolved at runtime to the repository's default branch via `GitHubRepository.defaultBranch` (`action.yml`; `src/services/ManifestCommitter.ts`). |
| `branch` | `"chore/repin-plugins"` | PR head branch (`pr` mode); force-reset onto base on every run (`action.yml`; `src/contract.ts`). |
| `commit-message` | *(unset)* | Empty ⇒ generated from the applied changes across every touched manifest plus the DCO trailer (`action.yml`; `src/inputs.ts`; `src/program.ts`). |
| `pr-title` | *(unset)* | Empty ⇒ generated `commitSubject` (`action.yml`; `src/inputs.ts`; `src/program.ts`). |
| `pr-body` | *(unset)* | Empty ⇒ generated `messageBody` (`action.yml`; `src/inputs.ts`; `src/program.ts`). |
| `auto-merge` | `"rebase"` | `merge`\|`squash`\|`rebase`, read with `ActionInput.literals`, so anything else is a `ConfigError` naming the input, the value, and the allowed set (`src/inputs.ts`); applied via a separate `PullRequest.setAutoMerge` call issued after `PullRequest.upsert`, so an auto-merge failure is never reported as though opening the PR had failed (`src/services/ManifestCommitter.ts`); has no effect in `commit` mode (`action.yml`; `src/contract.ts`). |
| `dry-run` | `"false"` | Validate every targeted manifest and emit `summary`/`result`, but make no commit or PR (`action.yml`; `src/contract.ts`; `src/inputs.ts`). |
| `app-client-id` | *(required)* | GitHub App client ID, read in `pre.ts` (`action.yml`; `src/pre.ts`). |
| `app-private-key` | *(required)* | GitHub App private key (PEM), read via `ActionInput.redacted` and stays `Redacted` end to end (`action.yml`; `src/pre.ts`). |

`mode`, `branch`, `auto-merge`, and `dry-run` are exactly the inputs mirrored
in `src/contract.ts`'s `INPUT_DEFAULTS`, because they are the only ones whose
manifest default is not the empty string — see
[action-contract](../models/action-contract.md).

`mode` and `auto-merge` are each read as
`ActionInput.literals(name, [...]).pipe(Config.withDefault(INPUT_DEFAULTS.x))`
(`src/inputs.ts`). The match is exact — no trimming, no case folding, so
`PR` or `Squash` is rejected — and the default covers only an absent or
empty input: a value outside the set fails as a `ConfigError` and is never
swallowed into the default.
