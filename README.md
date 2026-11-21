# AI Plugin Marketplace Manager

[![GitHub release](https://img.shields.io/github/v/release/spencerbeggs/ai-plugin-marketplace-manager?label=release&color=2088ff)](https://github.com/spencerbeggs/ai-plugin-marketplace-manager/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-4caf50.svg)](https://opensource.org/licenses/MIT) [![Node.js %3E%3D24.11.0](https://img.shields.io/badge/Node.js-%3E%3D24.11.0-5fa04e.svg)](https://nodejs.org/)

A GitHub Action that repins plugin entries in a Claude Code marketplace manifest (`.claude-plugin/marketplace.json`, `git-subdir` sources) and/or a GitHub Copilot marketplace manifest (`.github/plugin/marketplace.json`, `github` sources), validates every touched manifest, and lands the change as a single verified commit or a single pull request.

## Why Marketplace Manager

Re-pinning a plugin in a marketplace manifest by hand means editing JSON, keeping the file valid, and getting a signed commit past branch protection — twice over, if the plugin ships to both a Claude Code and a Copilot marketplace. This action does all of that from a single workflow step. It applies only the explicit `path` and `sha` values you pass — no "latest" lookup and no ref-to-sha resolution — so a run changes exactly what you asked for and nothing else. Edits preserve each file's existing formatting and comments, and every touched manifest lands in one commit, signed server-side through a GitHub App, which satisfies a "require signed commits" branch protection rule.

## Usage

The action reads manifests from the checked-out repository, so the job needs `actions/checkout` and write permissions. Authentication is a GitHub App (see [Authentication](#authentication)).

This example accepts changes from two triggers: a manual `workflow_dispatch` (fill in the form in the Actions tab) and a `repository_dispatch` sent by another repository (see [Triggering from another repository](#triggering-from-another-repository) below). The two triggers populate different contexts — `inputs.*` for `workflow_dispatch`, `github.event.client_payload.*` for `repository_dispatch` — so the manual fields (`name`, `marketplace`, `sha`, `path`) are simply forwarded from `inputs.*`, while only `json` switches on `github.event_name` to read from whichever context the trigger populated:

```yaml
name: Repin Plugins
on:
    workflow_dispatch:
        inputs:
            name:
                description: Name of the plugin to repin
                required: false
                type: string
            marketplace:
                description: Target marketplace (claude-code or copilot)
                required: false
                type: string
            sha:
                description: Commit SHA to repin to
                required: false
                type: string
            path:
                description: The path to the plugin root in the repository
                required: false
                type: string
            json:
                description: JSON object with a plugins array of per-plugin partial-merge patches
                required: false
                type: string
    repository_dispatch:
        types: [plugin-release]
permissions:
    contents: write
    pull-requests: write
concurrency:
    group: repin-plugins
    cancel-in-progress: false
jobs:
    repin:
        runs-on: ubuntu-latest
        permissions:
            contents: write
            pull-requests: write
        steps:
            - uses: actions/checkout@v7
              with:
                  fetch-depth: 0
            - uses: spencerbeggs/ai-plugin-marketplace-manager@v2
              with:
                  app-client-id: ${{ secrets.APP_CLIENT_ID }}
                  app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
                  name: ${{ inputs.name }}
                  marketplace: ${{ inputs.marketplace }}
                  sha: ${{ inputs.sha }}
                  path: ${{ inputs.path }}
                  json: ${{ github.event_name == 'workflow_dispatch' && inputs.json || github.event.client_payload.json }}
                  mode: commit
```

### Triggering from another repository

A plugin's own repository — the one that builds and publishes it — usually knows about a new release before the marketplace repo does. Instead of relying on `workflow_dispatch` (a human filling in a form) or a schedule, have the publishing repo's release workflow notify the marketplace repo directly with a `repository_dispatch` event as its last step. The `types: [plugin-release]` trigger above fires on any `event_type` you choose here — `plugin-release` is just a name both sides need to agree on.

`repository_dispatch` events cross a repository boundary, so the default `GITHUB_TOKEN` cannot send one — it is scoped to the repo the workflow runs in. Use a token that has access to the marketplace repo instead (a GitHub App installation token or a PAT with `repo` scope), stored as a secret in the **publishing** repo.

Using the GitHub CLI (no extra action needed) to repin the same plugin in both marketplaces from one dispatch:

```yaml
# .github/workflows/release.yml — in the plugin's own repository
name: Release
on:
    push:
        tags: ["v*"]
jobs:
    release:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v7
            # ...build/publish/tag steps...
            - name: Notify the marketplace repo
              env:
                  GH_TOKEN: ${{ secrets.MARKETPLACE_DISPATCH_TOKEN }}
              run: |
                  gh api repos/OWNER/MARKETPLACE_REPO/dispatches \
                    -f event_type=plugin-release \
                    -f 'client_payload[json]={"plugins":[{"name":"effected","marketplace":"claude-code","sha":"${{ github.sha }}"},{"name":"effected","marketplace":"copilot","sha":"${{ github.sha }}"}]}'
```

Using [`peter-evans/repository-dispatch`](https://github.com/peter-evans/repository-dispatch):

```yaml
- uses: peter-evans/repository-dispatch@v3
  with:
      token: ${{ secrets.MARKETPLACE_DISPATCH_TOKEN }}
      repository: OWNER/MARKETPLACE_REPO
      event-type: plugin-release
      client-payload: '{"json": "{\"plugins\":[{\"name\":\"effected\",\"marketplace\":\"claude-code\",\"sha\":\"${{ github.sha }}\"}]}"}'
```

Either way, `client_payload` should carry a `json` field: a `json` object with a `plugins` array, one entry per plugin repinned across one or both marketplaces — the same shape this action's `json` input accepts. The workflow above reads it back out via `github.event.client_payload.json`, whichever trigger fired. It looks like:

```json
{"plugins":[
  {"name":"effected","marketplace":"claude-code","sha":"<40-hex>"},
  {"name":"effected","marketplace":"copilot","sha":"<40-hex>","path":"plugins/copilot"}
]}
```

## Authentication

Commits are made through a GitHub App installation token, which is what makes them verified. Personal access tokens and the default `GITHUB_TOKEN` do not produce verified commits, so they are not supported.

1. Create a GitHub App with **Contents: read & write** and **Pull requests: read & write** repository permissions.
2. Install it on the repository whose manifests you want to update.
3. Store the App's client ID and private key (PEM) as repository or organization secrets.
4. Pass them as `app-client-id` and `app-private-key`.

The installation token is minted at the start of the run and revoked at the end. It is minted for the App's installation on the account that owns the repository the workflow runs in, so an App installed on several accounts works without extra configuration. Pass `app-owner` to use the installation on a different account.

## Inputs

Provide changes in one of two mutually exclusive ways: the **manual** path (`name` + `marketplace` + `sha`, `path` optional) or the **programmatic** path (`json`). Passing both is an error. Manual-path detection looks only at `name`, `sha`, and `path` — `marketplace` is never used to decide which path is active, so a `workflow_dispatch` choice input defaulting to `claude-code` cannot turn a `json`-only run into a spurious conflict.

| Input | Required | Default | Description |
| ----- | -------- | ------- | ----------- |
| `name` | manual path | `""` | Plugin entry name to repin. Requires `marketplace` and `sha`. |
| `marketplace` | manual path | `""` | Target marketplace: `claude-code` (`.claude-plugin/marketplace.json`) or `copilot` (`.github/plugin/marketplace.json`). Required once the manual path is active; never used to detect it. |
| `path` | no | `""` | New `source.path` for the named plugin (manual path, optional). |
| `sha` | manual path | `""` | New `source.sha` (40-hex lowercase commit) for the named plugin (manual path, required). |
| `json` | programmatic path | `""` | JSON object with a `plugins` array of patches: `{ "plugins": [{ "name", "marketplace", "sha", "path"? }] }`. Each entry names an existing plugin in one marketplace and sets its `sha` (and optionally `path`). `plugins` must be non-empty; a `(marketplace, name)` pair may appear at most once. Validated against the committed [input schema](schemas/2.0/input.json). |
| `mode` | no | `commit` | `commit` (commit direct to the base branch) or `pr` (open a pull request). |
| `base-branch` | no | repo default branch | Branch to commit to (`commit` mode) or the PR base (`pr` mode). |
| `branch` | no | `chore/repin-plugins` | PR head branch (`pr` mode). Force-reset onto the base branch on every run — any commits an earlier run left on it are discarded. |
| `commit-message` | no | generated | Commit message. Generated from the applied changes when unset. |
| `pr-title` | no | generated | PR title (`pr` mode). Generated when unset. |
| `pr-body` | no | generated | PR body (`pr` mode). Generated when unset. |
| `auto-merge` | no | `rebase` | Merge method (`merge`, `squash`, or `rebase`) to enable auto-merge with on the opened/updated PR. Only applies in `pr` mode; ignored in `commit` mode. |
| `dry-run` | no | `false` | Validate every targeted manifest and emit the summary and outputs, but make no commit or PR. |
| `app-client-id` | yes | — | GitHub App client ID. |
| `app-private-key` | yes | — | GitHub App private key (PEM). |
| `app-owner` | no | repository owner | Account (user or organization) whose installation of the App to mint the token for. Set it only when the App is installed on a different account than the one that owns the repository the workflow runs in. |

There is no `url` input. Only `path` and `sha` can be repinned.

## Outputs

| Output | Description |
| ------ | ----------- |
| `result` | Structured JSON describing the run, governed by the committed [output schema](schemas/2.0/output.json). The scalars below mirror its common fields. |
| `status` | `no-op`, `success`, or `failed`. |
| `changed` | `true` when at least one manifest was modified. |
| `mode` | `commit` or `pr`. |
| `commit-sha` | SHA of the verified commit, or empty. |
| `commit-url` | HTML URL of the commit, or empty. |
| `pr-number` | PR number (`pr` mode), or empty. |
| `pr-url` | PR URL (`pr` mode), or empty. |
| `plugins-updated` | Count of `(marketplace, name)` pairs whose fields changed, across both manifests. |

The `result` payload carries the full contract:

```json
{
  "$schema": "https://raw.githubusercontent.com/spencerbeggs/ai-plugin-marketplace-manager/main/schemas/2.0/output.json",
  "mode": "commit",
  "status": "success",
  "noop": false,
  "succeeded": true,
  "hasFailures": false,
  "dryRun": false,
  "pluginsUpdated": 2,
  "plugins": [
    { "marketplace": "claude-code", "manifest": ".claude-plugin/marketplace.json", "name": "effected", "fields": ["sha"] },
    { "marketplace": "copilot", "manifest": ".github/plugin/marketplace.json", "name": "effected", "fields": ["sha", "path"] }
  ],
  "manifests": [".claude-plugin/marketplace.json", ".github/plugin/marketplace.json"],
  "commit": { "sha": "…", "url": "…" },
  "pr": null
}
```

`plugins[]` is grouped by `(marketplace, name)` — the same plugin repinned in both marketplaces produces two entries, not one merged entry. `manifests` lists only the files the run changed (or, in dry-run, would change). There is no in-band `schemaVersion` field; the schema version lives in the `$schema` URL's `schemas/<version>/` path.

Read a scalar in a later step:

```yaml
- id: repin
  uses: spencerbeggs/ai-plugin-marketplace-manager@v2
  with:
    name: effected
    marketplace: claude-code
    sha: 8cba76025762cfa1dca24e6daafe2e3dc7c14924
    app-client-id: ${{ secrets.APP_CLIENT_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
- run: echo "status=${{ steps.repin.outputs.status }} sha=${{ steps.repin.outputs.commit-sha }}"
  # status=success sha=<40-hex commit sha>
```

## Behavior

- **Fixed manifest paths.** `claude-code` always means `.claude-plugin/marketplace.json`; `copilot` always means `.github/plugin/marketplace.json`. There is no path input and no discovery.
- **All-or-nothing.** Every manifest a patch targets is read, edited, and validated before anything is committed. If any targeted manifest is missing or a validated edit fails, nothing lands — not even the manifests that were fine.
- **Validation before landing.** Each edited manifest is validated (ajv structural checks plus semantic checks) before anything is committed. Claude Code entries must be `git-subdir` sources; Copilot entries must be `github` sources (a bare path string or any other `source.source` fails validation).
- **One commit, both files.** When a run touches both manifests, both land in the same commit (or the same PR head move) — never two separate commits.
- **No-op safety.** When the requested changes leave every targeted manifest byte-for-byte unchanged, the run reports `status: no-op` and makes no commit or PR.
- **Generated messages.** With `commit-message`, `pr-title`, and `pr-body` unset, the default subject identifies changes by `(marketplace, name)` pair, using `<plugin name>@<manifest name>` (the manifest's own top-level `name` field, not the marketplace id) as the reference: `ai(marketplace): repinned effected@spencerbeggs (copilot)` for one pair, `ai(marketplace): repinned effected@spencerbeggs (claude-code, copilot)` when the same plugin, in manifests with the same `name`, changed in both marketplaces, or `ai(marketplace): repinned N plugins` otherwise — with a DCO `Signed-off-by:` trailer from the App bot.
- **Dry run.** `dry-run: true` runs the full edit and validation for every targeted manifest and populates the outputs, but writes no commit or PR.
- **Auto-merge.** In `pr` mode, the opened (or reused) PR has auto-merge enabled with the `auto-merge` method (default `rebase`) via GitHub's native auto-merge — the PR still merges only once required checks and reviews pass. Auto-merge is applied as a separate step after the pull request is opened or updated, so a repository that refuses the requested merge method still gets its pull request. Re-running the action against the same open PR re-applies auto-merge with the current method. Has no effect in `commit` mode.

## Examples

Repin the same plugin in both marketplaces at once through the programmatic path, landing one commit that touches both manifests:

```yaml
- uses: spencerbeggs/ai-plugin-marketplace-manager@v2
  with:
    json: |
      {
        "plugins": [
          { "name": "effected", "marketplace": "claude-code", "sha": "8cba76025762cfa1dca24e6daafe2e3dc7c14924" },
          { "name": "effected", "marketplace": "copilot", "sha": "8cba76025762cfa1dca24e6daafe2e3dc7c14924", "path": "plugins/copilot" }
        ]
      }
    app-client-id: ${{ secrets.APP_CLIENT_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
```

Open a pull request instead of committing to the base branch (auto-merge defaults to `rebase`):

```yaml
- uses: spencerbeggs/ai-plugin-marketplace-manager@v2
  with:
    name: effected
    marketplace: claude-code
    sha: 8cba76025762cfa1dca24e6daafe2e3dc7c14924
    mode: pr
    branch: chore/repin-effected
    app-client-id: ${{ secrets.APP_CLIENT_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
```

Every `pr`-mode run re-roots the head branch at the base branch's current tip: the commit is built against that tip first, then the head branch is moved straight to the finished commit in one step. Re-running against the same `branch` updates the existing pull request in place instead of stacking another commit on it, and the branch never passes through a state where it equals base. Each run leaves a single commit that diffs cleanly against the current base. Treat that branch as owned by the action: commits pushed to it by anything else are discarded on the next run.

Open a pull request with a specific auto-merge method:

```yaml
- uses: spencerbeggs/ai-plugin-marketplace-manager@v2
  with:
    name: effected
    marketplace: copilot
    sha: 8cba76025762cfa1dca24e6daafe2e3dc7c14924
    mode: pr
    auto-merge: squash
    app-client-id: ${{ secrets.APP_CLIENT_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
```

## Migrating from v1

v1 edited only the Claude Code manifest. v2 adds GitHub Copilot support and changes the contract:

- **Rename the `uses:` reference** from `spencerbeggs/claude-code-marketplace-manager@v1` to `spencerbeggs/ai-plugin-marketplace-manager@v2`. The `v1` tag itself doesn't move, and the old repository name keeps resolving through GitHub's repository-rename redirect, so `@v1` keeps working — but new workflows should move to `@v2`.
- **`url` is removed.** There is no more `source.url` repinning on either path; only `path` and `sha` can be changed.
- **`marketplace` is now required on every patch**, manual or `json`. An existing Claude-only `json` payload needs `"marketplace": "claude-code"` added to every entry; the manual path needs the new `marketplace` input wired up alongside `name` and `sha`.
- **`sha` is now required on every patch, manual or `json`** (it was optional in v1, where `name` plus any one of `url`/`path`/`sha` was enough). A v1 `json` entry that only ever set `path` — `{ "name": "effected", "path": "plugins/copilot" }` — now fails decode; add a `sha`.
- **`result` moved to `schemas/2.0/output.json`.** The in-band `schemaVersion` field was removed — the version now lives only in the `$schema` URL's `schemas/<version>/` path. `plugins[]` entries gained `marketplace` and `manifest` fields (grouping is now by `(marketplace, name)` pair, not name alone), and a new top-level `manifests[]` array lists every file the run touched.
- **`schemas/1.0/`** (the v1 input/output documents) stays committed and frozen. At the rename its `$id` moved to `https://raw.githubusercontent.com/spencerbeggs/ai-plugin-marketplace-manager/main/schemas/1.0/output.json` (and `…/input.json`); the old `claude-code-marketplace-manager` URL that v1 payloads carry as `$schema` keeps resolving through GitHub's repository-rename redirect, so any code still validating against the v1 schema keeps working.

## Requirements

- Node.js >=24.11.0 (supplied by the `node24` runtime; no local install needed).
- A GitHub App with `contents: write` and `pull_requests: write`, installed on the target repository.
- A `.claude-plugin/marketplace.json` and/or `.github/plugin/marketplace.json` manifest in the checked-out repository, matching whichever marketplace or marketplaces you target.

## License

[MIT](LICENSE)
