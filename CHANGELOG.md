# claude-code-marketplace-manager

## 2.0.1

### Dependencies

| Dependency | Type | Action | From | To |
| --- | --- | --- | --- | --- |
| @effected/github | dependency | updated | ^0.12.0 | ^0.13.0 |
| @effected/github-actions | dependency | updated | ^0.16.0 | ^0.16.1 |
| @effected/schemastore | dependency | updated | ^0.15.0 | ^0.15.1 |

[#120][#120]

### Thanks

Thanks to [@spencerbeggs](https://github.com/apps/spencerbeggs) for their contributions!

[#120]: https://github.com/spencerbeggs/ai-plugin-marketplace-manager/pull/120

## 2.0.0

### Breaking Changes

#### Repository and package renamed

- The repository and package move from `claude-code-marketplace-manager` to
  `ai-plugin-marketplace-manager`. Point workflows at the new repo and pin
  `@v2`:

```yaml
uses: spencerbeggs/ai-plugin-marketplace-manager@v2
```

#### Every patch now names a `marketplace`, and `url` is gone

- Each entry in the `json` input must declare which marketplace it targets:

```json
{
  "plugins": [
    { "name": "my-plugin", "marketplace": "claude-code", "sha": "a1b2c3..." }
  ]
}
```

- `marketplace` is `"claude-code" | "copilot"`. A leftover `url` field from the
  v1 shape is rejected outright with a migration error rather than silently
  dropped. `sha` is now required on every patch, manual or `json`; `path`
  stays optional. Two patches naming the same `(marketplace, name)` pair are also rejected as
  duplicates.

#### Result output moved to `schemas/2.0/output.json`

- `schemaVersion` is gone from the result. Each entry in `plugins[]` now
  carries `marketplace` and `manifest` alongside `name` and `fields`, and the
  result adds a top-level `manifests[]` listing every manifest file the run
  touched (or would touch, in dry-run). `pluginsUpdated` now counts distinct
  `(marketplace, name)` pairs. Commit subjects for a single plugin also name its
  marketplace(s).

### Features

#### GitHub Copilot marketplace support

- Patches can now target either marketplace manifest in the same run:
  `.claude-plugin/marketplace.json` for `git-subdir` sources (Claude Code), or
  the new `.github/plugin/marketplace.json` for `github` sources (Copilot).
  When a run touches both, every change lands together in one verified commit
  or pull request.

- A patch may add a `sha` or `path` to an entry that doesn't have one yet,
  so an unpinned entry can be pinned by dispatch. If a run targets a manifest that doesn't exist in the checkout, it
  fails with a clear error naming the missing file. An unpinnable Copilot
  entry — one whose `source` is a bare path string rather than a `github`
  source object — fails validation with a readable message instead of a
  confusing internal error.

### Thanks

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

## 1.1.6

### Dependencies

| Dependency | Type | Action | From | To |
| --- | --- | --- | --- | --- |
| @effect/platform-node | dependency | updated | 4.0.0-rc.116 | 4.0.0-rc.117 |
| @effected/github | dependency | updated | ^0.11.0 | ^0.12.0 |
| @effected/github-actions | dependency | updated | ^0.15.0 | ^0.16.0 |
| @effected/jsonc | dependency | updated | ^0.12.0 | ^0.13.0 |
| @effected/schemastore | dependency | updated | ^0.14.0 | ^0.15.0 |
| effect | dependency | updated | 4.0.0-rc.116 | 4.0.0-rc.117 |

[#115][#115]

### Thanks

Thanks to [@spencerbeggs](https://github.com/apps/spencerbeggs) for their contributions!

[#115]: https://github.com/spencerbeggs/claude-code-marketplace-manager/pull/115

## 1.1.5

### Dependencies

| Dependency | Type | Action | From | To |
| --- | --- | --- | --- | --- |
| @effected/github-actions | dependency | updated | ^0.14.0 | ^0.15.0 |

[#113][#113]

### Thanks

Thanks to [@spencerbeggs](https://github.com/apps/spencerbeggs) for their contributions!

[#113]: https://github.com/spencerbeggs/claude-code-marketplace-manager/pull/113

## 1.1.4

### Dependencies

| Dependency | Type | Action | From | To |
| --- | --- | --- | --- | --- |
| @effect/platform-node | dependency | updated | 4.0.0-rc.115 | 4.0.0-rc.116 |
| @effected/github | dependency | updated | ^0.10.2 | ^0.11.0 |
| @effected/github-actions | dependency | updated | ^0.13.4 | ^0.14.0 |
| @effected/jsonc | dependency | updated | ^0.11.1 | ^0.12.0 |
| @effected/schemastore | dependency | updated | ^0.13.1 | ^0.14.0 |
| effect | dependency | updated | 4.0.0-rc.115 | 4.0.0-rc.116 |

[#104][#104]

### Thanks

Thanks to [@spencerbeggs](https://github.com/apps/spencerbeggs) for their contributions!

[#104]: https://github.com/spencerbeggs/claude-code-marketplace-manager/pull/104

## 1.1.3

### Dependencies

| Dependency | Type | Action | From | To |
| --- | --- | --- | --- | --- |
| @effected/github-actions | dependency | updated | ^0.13.3 | ^0.13.4 |

[#102][#102]

### Thanks

Thanks to [@spencerbeggs](https://github.com/apps/spencerbeggs) for their contributions!

[#102]: https://github.com/spencerbeggs/claude-code-marketplace-manager/pull/102

## 1.1.2

### Dependencies

| Dependency | Type | Action | From | To |
| --- | --- | --- | --- | --- |
| @effected/github | dependency | updated | ^0.10.1 | ^0.10.2 |
| @effected/github-actions | dependency | updated | ^0.13.2 | ^0.13.3 |
| @effected/jsonc | dependency | updated | ^0.11.0 | ^0.11.1 |
| @effected/schemastore | dependency | updated | ^0.13.0 | ^0.13.1 |

[#99][#99]

### Thanks

Thanks to [@spencerbeggs](https://github.com/apps/spencerbeggs) for their contributions!

[#99]: https://github.com/spencerbeggs/claude-code-marketplace-manager/pull/99

## 1.1.1

### Dependencies

| Dependency | Type | Action | From | To |
| --- | --- | --- | --- | --- |
| @effected/github-actions | dependency | updated | ^0.13.1 | ^0.13.2 |

[#97][#97]

### Thanks

Thanks to [@spencerbeggs](https://github.com/apps/spencerbeggs) for their contributions!

[#97]: https://github.com/spencerbeggs/claude-code-marketplace-manager/pull/97

## 1.1.0

### Features

#### Versioned, generated JSON Schema documents

- The two JSON Schema documents that govern the action's `json` input and `result` output are now generated by `@effected/schemastore-cli` from `lib/scripts/schemastore.config.ts`, and live under a versioned path: `schemas/1.0/input.json` and `schemas/1.0/output.json`. The previous root-level `claude-code-marketplace-manager.input.json` and `claude-code-marketplace-manager.output.json` files are removed.

- The `$schema` URL carried in the `result` output, and referenced by the `json` input's schema documentation, moves accordingly:

```diff
- https://raw.githubusercontent.com/spencerbeggs/claude-code-marketplace-manager/main/claude-code-marketplace-manager.output.json
+ https://raw.githubusercontent.com/spencerbeggs/claude-code-marketplace-manager/main/schemas/1.0/output.json
```

- This is a minor change, not a breaking one: the hosted schema URL has never been published to SchemaStore, so no external consumer resolves it by the old address. Anything validating a `result` payload against a hard-coded copy of the old URL should switch to the versioned path.

- New `pnpm schema:build` / `pnpm schema:check` scripts replace the removed `generate-schema` script; `schema:check` now gates `ci:test`, so a schema document that drifts from its Effect Schema source fails CI before tests run. [#94][#94]

### Dependencies

| Dependency | Type | Action | From | To |
| --- | --- | --- | --- | --- |
| @effected/github-actions | dependency | updated | ^0.13.0 | ^0.13.1 |
| @effected/schemastore | dependency | added | — | ^0.13.0 |

[#94][#94]

### Thanks

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#94]: https://github.com/spencerbeggs/claude-code-marketplace-manager/pull/94

## 1.0.7

### Dependencies

| Dependency | Type | Action | From | To |
| --- | --- | --- | --- | --- |
| @effected/github-actions | dependency | updated | ^0.12.0 | ^0.13.0 |

[#86][#86]

### Thanks

Thanks to [@spencerbeggs](https://github.com/apps/spencerbeggs) for their contributions!

[#86]: https://github.com/spencerbeggs/claude-code-marketplace-manager/pull/86

## 1.0.6

### Maintenance

- Updates effected kit to latest versions.

### Thanks

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

## 1.0.5

### Dependencies

| Dependency | Type | Action | From | To |
| --- | --- | --- | --- | --- |
| @effect/platform-node | dependency | updated | 4.0.0-rc.109 | 4.0.0-rc.112 |
| @effected/github | dependency | updated | ^0.8.0 | ^0.8.0 |
| @effected/github-actions | dependency | updated | ^0.10.2 | ^0.10.1 |
| @effected/jsonc | dependency | updated | ^0.8.1 | ^0.8.0 |
| effect | dependency | updated | 4.0.0-rc.109 | 4.0.0-rc.112 |

[#67][#67]

[#37][#37]

[#37][#37]

[#37][#37]

[#37][#37]

### Thanks

Thanks to [@spencerbeggs](https://github.com/apps/spencerbeggs) for their contributions!

[#37]: https://github.com/spencerbeggs/claude-code-marketplace-manager/pull/37

[#67]: https://github.com/spencerbeggs/claude-code-marketplace-manager/pull/67

## 1.0.4

### Maintenance

- Adopts `effect@rc.109`

### Patch Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

## 1.0.3

### Bug Fixes

- `land` now refuses `pr` mode when `base` and `branch` are the same. Previously nothing stopped the two from colliding, and the single `GitBranch.upsert` would move the *base* branch itself onto the new commit — landing an unreviewed change directly on it, with the pull request call only failing afterward on a head equal to its base. The guard runs before the commit is built, so `land`'s error channel now also includes `InvalidInputError`. `commit` mode is unaffected — it never reads `branch`. [#20][#20]

* Fixed a `pr` mode race where the action's own pull request could be auto-closed by GitHub. The landing sequence now builds the finished commit first and moves the head branch straight onto it with a single update, so the branch never passes through a state where it's identical to `base` (which GitHub reads as an empty diff and auto-closes). The existing force-reset guarantee is unchanged: every `pr`-mode run still discards the previous run's commits and re-roots on `base`'s current tip.
* Auto-merge is now requested as a separate step after the pull request is opened or updated, so a repository that rejects the requested merge method no longer makes PR creation itself look like it failed. A failure to enable auto-merge still fails the run.

### Refactoring

- Default-branch resolution now goes through the library's repository service instead of a hand-written API type cast.
- Consolidated four internal error types into a single structured error with a `kind` field, and collapsed duplicate layer wiring between the `pre` and `post` phases. [#20][#20]

### Dependencies

- | Dependency | Type | Action | From | To |  |
  | --- | --- | --- | --- | --- | --- |
  | @effected/jsonc | dependency | updated | \~0.5.1 | \~0.5.2 | [#17][#17] Thanks [@spencerbeggs](https://github.com/apps/spencerbeggs)! |

* | Dependency | Type | Action | From | To |  |
  | --- | --- | --- | --- | --- | --- |
  | @savvy-web/github-action-effects | dependency | removed | ^3.1.0 | — |  |
  | @effected/github | dependency | added | — | \~0.2.2 |  |
  | @effected/github-actions | dependency | added | — | \~0.5.0 | [#20][#20] Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

### Patch Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#17]: https://github.com/spencerbeggs/claude-code-marketplace-manager/pull/17

[#20]: https://github.com/spencerbeggs/claude-code-marketplace-manager/pull/20

## 1.0.2

### Dependencies

- | Dependency | Type | Action | From | To |  |
  | --- | --- | --- | --- | --- | --- |
  | @savvy-web/github-action-effects | dependency | updated | ^3.0.5 | ^3.1.0 | [#8][#8] Thanks [@spencerbeggs](https://github.com/apps/spencerbeggs)! |

### Patch Changes

[#8]: https://github.com/spencerbeggs/claude-code-marketplace-manager/pull/8

## 1.0.1

### Bug Fixes

- `pr` mode now resets the head branch onto the base branch before committing, so re-running against the same `branch` updates the existing pull request in place instead of stacking another commit onto an increasingly stale base. Because `branch` defaults to a fixed name reused run over run, the old behavior let long-lived branches drift until the pull request reported a merge conflict.
- Each `pr`-mode run now leaves a single commit that diffs cleanly against the current base. Treat that branch as owned by the action: commits pushed to it by anything else are discarded on the next run.

### Refactoring

- `ManifestCommitter.land` now takes a validated, non-no-op manifest change rather than raw text, making "commit unvalidated text" and "commit byte-identical text" compile errors instead of ordering conventions. `EditResult` became a `NoopEdit | ChangedEdit` union and `ManifestValidator.validateEdit` mints the branded value `land` accepts. Internal only — no input or output contract changed. [#6][#6]

### Patch Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#6]: https://github.com/spencerbeggs/claude-code-marketplace-manager/pull/6

## 1.0.0

### Features

- ### Marketplace Manager action
  New GitHub Action that re-pins `git-subdir` plugin entries in a Claude Code marketplace manifest (`.claude-plugin/marketplace.json`) and lands the edit as a verified commit or a pull request. First release.
  - **Explicit values only.** Applies exactly the `url`, `path`, and `sha` you pass — no "latest" lookup, no ref-to-sha resolution. A run changes exactly what you asked for.
  - **Two mutually exclusive input paths:** a manual single-plugin path (`name` plus at least one of `url`/`path`/`sha`), or a programmatic `json` path — an object with a `plugins` array of per-plugin partial-merge patches (`{"plugins":[{"name":"...","sha":"..."}]}`). Omitted fields on a patched plugin are left untouched.
  - **Validated before landing.** The edited manifest is checked against both structural (JSON Schema) and semantic rules before anything is committed; on failure the file is left untouched and the run fails. A no-op edit (manifest byte-for-byte unchanged) reports `status: no-op` and makes no commit or PR.
  - **Verified commits.** Lands via `mode: commit` (direct to the base branch) or `mode: pr` (opens/updates a pull request), signed server-side through a GitHub App installation token — satisfying "require signed commits" branch protection. Default commit/PR messages follow `ai(marketplace): repinned <plugin>@<manifest>` with a DCO `Signed-off-by:` trailer from the App bot identity.
  - **Auto-merge.** In `pr` mode, the opened/updated PR has auto-merge enabled via the `auto-merge` input (`merge`, `squash`, or `rebase`; defaults to `rebase`), using GitHub's native auto-merge so the PR still waits on required checks and reviews. No effect in `commit` mode.
  - **Structured output.** Emits a `result` JSON payload (governed by a committed, drift-tested JSON Schema) plus convenience scalars (`status`, `changed`, `mode`, `commit-sha`, `commit-url`, `pr-number`, `pr-url`, `plugins-updated`), and a markdown job summary.

  ```yaml
  - uses: spencerbeggs/claude-code-marketplace-manager@v1
    with:
      name: vitest-agent
      sha: 8cba76025762cfa1dca24e6daafe2e3dc7c14924
      app-client-id: ${{ secrets.APP_CLIENT_ID }}
      app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
  ```
