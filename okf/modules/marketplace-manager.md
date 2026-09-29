---
type: Module
title: marketplace-manager
description: The GitHub Action's src/ tree — the three-phase lifecycle, the per-marketplace program.ts orchestration pipeline, layer composition, and the landing/mode split.
kind: action
resource: ../../src
status: stable
generated:
  by: okfit/claude-code
  at: 2026-09-29T03:16:59Z
  body_sha256: 575b3a9fe4d7bb93b3d2d64e1ac42f1c009716f1184bbad9dc44176bb3907d21
tags: [architecture]
---

# marketplace-manager

The one code unit in this repository: a GitHub Action that runs as the
standard pre / main / post lifecycle.

## Three-phase shape

| Phase | File | Responsibility |
| --- | --- | --- |
| pre | `src/pre.ts` | Provision a GitHub App installation token with `REQUIRED_PERMISSIONS = { contents: "write", pull_requests: "write" }` (`src/pre.ts:17-20`); record the start time into cross-phase state. |
| main | `src/main.ts` | Thin `Action.run(program, { layer: MainLive })` behind the `GITHUB_ACTIONS` guard (`src/main.ts:6-8`). All work lives in `program.ts`. |
| post | `src/post.ts` | Revoke-first: unconditionally dispose the installation token before anything else in the phase, then best-effort report the run duration (`src/post.ts:25-41`). |

`REQUIRED_PERMISSIONS` is passed to `GitHubToken.provision` as `required`,
which verifies what GitHub actually granted rather than requesting a
scope-down (`src/pre.ts:6-20`). The check is pure — the granted permissions
travel back with the minted token — and runs before the token is persisted,
so a misconfigured installation fails in `pre` naming the missing permission
instead of failing mid-`main` on a bare 403. The App credentials
(`app-client-id`, `app-private-key`) are explicit arguments to
`GitHubToken.provision`; the private key is read with `ActionInput.redacted`
and stays `Redacted` end to end — `provision` takes the wrapper directly, so
it is never unwrapped in this module (`src/pre.ts:38-42`).

The installation token is always revoked in `post`, with no opt-out
(`src/post.ts:10-16`): revocation runs first and is sequenced ahead of the
duration read, which carries its own `catch` so it can never displace
revocation, and the whole phase is wrapped in `Effect.catchDefect`
(`src/post.ts:39-41`) so nothing in the phase can fail the run on the way
out.

Every entry point ends in `if (process.env.GITHUB_ACTIONS) { await
Action.run(…) }` (`src/pre.ts:47-49`, `src/main.ts:6-8`, `src/post.ts:44-46`).
This is a pair with `vitest.setup.ts`'s `globalSetup`, which strips the
runner environment before the forks pool spawns — see
[entry-point-guard-and-env-strip-are-a-pair](../conventions/entry-point-guard-and-env-strip-are-a-pair.md).

## Orchestration (`src/program.ts`)

`program` (`src/program.ts:175-191`) wraps `parseInputs` and the
orchestration body (`runOrchestration`, `src/program.ts:69-167`) each in
`Effect.exit`. On a typed failure at either stage it emits a structured
failed `result` (`status: "failed"`, `hasFailures: true`, `succeeded: false`)
via `emitFailure` (`src/program.ts:52-66`), then re-raises with
`Effect.failCause` so the action still exits non-zero.

**`emitFailure` swallows its own failures, and that is enforced in the
helper rather than assumed at the call sites.** Both callers run it before
re-raising the cause that actually failed the run, so anything escaping it
would short-circuit the `yield*` and take the place of that cause — the run
would report an output-write problem instead of the validation or API error
it exists to report. `emit` (`src/program.ts:17-33`) guards its own
`setJson` and `summary` calls, but the eight plain `outputs.set` writes
between them are unguarded and each touches the runner's file descriptor, so
this is reachable rather than theoretical. `emitFailure` is therefore
wrapped in `Effect.catchCause` rather than `Effect.catch`
(`src/program.ts:66`), because a defect displaces the real cause just as
effectively as a typed failure — see
[test-doubles-transform-and-fixtures-isolate](../conventions/test-doubles-transform-and-fixtures-isolate.md)
for how this is pinned by a fault-injection test.

The full logical pipeline, in order (step 1 in `program`, steps 2–8 in
`runOrchestration`):

1. **Parse inputs** (`parseInputs`, `src/inputs.ts`) → a normalized
   `ParsedInputs` with a `patches` array, enforcing the manual/`json` XOR
   (`src/inputs.ts`). See
   [action-inputs](../interfaces/action-inputs.md).
2. **Per marketplace, in `MARKETPLACE_ORDER` (`claude-code`, then
   `copilot`)** (`src/program.ts`, `src/marketplaces.ts`): group the
   patches targeting that marketplace; skip the marketplace entirely if it
   has none. For each targeted marketplace —
   **read manifest** (`readManifest`, `src/services/ManifestEditor.ts`)
   from the checkout, failing with `ManifestNotFoundError` if the fixed
   path is missing, then
   **apply patches** (`applyPatches`, `src/services/ManifestEditor.ts`) —
   format-preserving partial-merge via `@effected/jsonc`, matched by entry
   name within that manifest, inserting a field absent from `source`
   rather than only replacing one present. An unknown name fails with
   `PluginNotFoundError`; a patched entry whose current `source` is not an
   object (Copilot's bare-string shorthand) fails with
   `ManifestValidationError` before `JsoncModifier.modify` ever runs,
   reusing the marketplace descriptor's `sourceErrors` so the message
   matches what step 3 below would report for the same entry. See
   [patch](../glossary/patch.md).
3. **No-op guard, per manifest** (`src/program.ts`). If a manifest's edited
   text equals its original, skip it — no validation, no commit — and move
   to the next marketplace. `EditResult` is a union discriminated on
   `changed` (`src/services/ManifestEditor.ts`), so this guard is also what
   narrows the edit to the `ChangedEdit` that validation requires. If
   *every* targeted manifest turns out byte-stable, emit one `noop` result
   for the whole run and stop.
4. **Validate the result, per manifest** (`validateEdit`,
   `src/services/ManifestValidator.ts`) before any commit, returning the
   branded `ValidatedManifestChange` (now carrying `marketplace` and
   `path`) that `land` requires. Every targeted manifest is validated
   before any of them land — **all-or-nothing across files**: the first
   validation failure stops the run before anything is committed, even a
   manifest that validated cleanly earlier in the loop. See
   [validate-the-result-before-landing](../conventions/validate-the-result-before-landing.md)
   and
   [landing-requires-a-validated-non-noop-change](../invariants/landing-requires-a-validated-non-noop-change.md).
5. **Dry-run guard** (`src/program.ts`). If `dryRun`, emit the
   summary/output — covering every targeted manifest — and stop before
   landing. Dry-run never reads the token identity, so no provisioned
   token is required on that path.
6. **Build default messages** (`src/program.ts`).
   `GitHubToken.botIdentity()` feeds the DCO trailer only; the commit
   subject/body come from the combined change set across every validated
   manifest. This runs only on the land path.
7. **Land** (`land`, `src/services/ManifestCommitter.ts`) per `mode`
   (commit or PR), given the **non-empty array** of validated changes —
   one per changed manifest, never one manifest at a time.
8. **Emit** (`src/program.ts`) the structured `result` output, convenience
   scalars, and a job summary — both non-fatal.

## Module layout (`src/`)

| Area | Files | Role |
| --- | --- | --- |
| Lifecycle | `pre.ts`, `main.ts`, `post.ts` | Phase entrypoints. |
| Orchestration | `program.ts` | The main pipeline (above), looping `MARKETPLACE_ORDER`. |
| Marketplaces | `marketplaces.ts` | Plain-data `Marketplace` descriptors — fixed `path`, compiled structural `validateStructural`, and `sourceErrors` — one per kind (`CLAUDE_CODE`, `COPILOT`), keyed by `MARKETPLACES` and ordered by `MARKETPLACE_ORDER`. Adding a third marketplace is a new descriptor plus a literal in `MarketplaceId`; `program.ts` does not change. |
| Inputs | `inputs.ts` | `parseInputs` → `ParsedInputs`; enforces the XOR (`marketplace` excluded from manual-path detection); rejects a legacy `url` key and duplicate `(marketplace, name)` pairs. |
| Contract | `contract.ts` | The declared input/output names and non-empty defaults; dependency-free. See [action-contract](../models/action-contract.md). |
| Errors | `errors/errors.ts` | Tagged errors: `InvalidInputError`, `PluginNotFoundError`, `ManifestNotFoundError`, `ManifestValidationError` — the last three each carry `marketplace` and `path`. |
| Schema | `schema/marketplace.ts`, `schema/input.ts`, `schema/report-output.ts`, `schema/projections.ts` | Effect Schemas (source of truth) plus the pure output projection. See [effect-schemas](../models/effect-schemas.md). |
| Services | `services/ManifestEditor.ts`, `services/ManifestValidator.ts`, `services/ManifestCommitter.ts` | Read/edit, validate, and land — each taking the target `Marketplace` descriptor as a parameter rather than hardcoding a path. |
| Report | `report.ts` | Pure default-message and job-summary builders, grouped by `(marketplace, name)` pair. |
| Wiring | `layers/app.ts`, `state.ts` | `PreLive`/`MainLive`/`PostLive` layers; cross-phase start-time state. |

## Layer composition (`src/layers/app.ts`)

`PreLive` and `PostLive` are one layer, not two: `PreLive = GitHubApp.layer`
and `PostLive = PreLive` (`src/layers/app.ts:22-23`). `GitHubApp.layer`
requires nothing — it signs the app JWT itself — and `ActionRuntime.layer`,
which `Action.run` always composes, already provides `FileSystem`,
`HttpClient`, `ActionState` and `ActionOutputs`.

`MainLive` (`src/layers/app.ts:48-54`) reads the installation token
provisioned in `pre` back via `GitHubToken.clientLayer()`, wrapped in
`Layer.orDie` (`src/layers/app.ts:36`) — a missing or expired token in
`main` is a wiring defect, not a condition this action can act on, and
`ActionRunOptions.layer` requires a `never` error channel. It is bound to a
`const` (`client`, `src/layers/app.ts:36`) deliberately: `clientLayer()` is
a parameterized factory and layers memoize **by reference**, so calling it
at each composition site would build four independent clients.
`GitCommit.layer`, `GitBranch.layer`, `PullRequest.layer` and
`GitHubRepository.layer` are each built from that one client and merged
with `Repo.layerFromConfig()` (`src/layers/app.ts:45-54`). No separate
GraphQL layer is needed — auto-merge is a `PullRequest` member now.

**`Repo` is resolved per call, not captured at layer construction**
(`src/layers/app.ts:38-44`): every resource method carries `Repo` in its
requirements, which is what makes a scoped `Repo.provide` override work
rather than silently do nothing.

## Landing (`src/services/ManifestCommitter.ts`)

`land(params)` owns the mode split. `LandParams.changes` is a **non-empty
array** of `ValidatedManifestChange` — one per touched manifest, not one
manifest at a time — and `land` maps it straight to one `FileContent` per
file, so a run that repins a plugin in both marketplaces still produces one
tree and one commit (or one PR head move). It never passes author,
committer, or signature — see
[verified-commit](../glossary/verified-commit.md).

- **commit mode**: `commit.commitFiles({ branch: base, message, changes })`
  directly on the base branch — `commitFiles` reads the base head as parent
  itself. `changes` is the array of `FileContent` instances built from
  every validated change, not a single `{ path, content }` literal.
- **pr mode** — the commit is built before the ref moves:
  `branch.sha(base)` → `commit.get(baseSha)` →
  `commit.createTree({ changes, baseTree })` →
  `commit.createCommit({ message, tree, parents: [baseSha] })` →
  `branch.upsert(head, sha)` once, straight to the finished commit →
  `pulls.upsert({ title, head, base, body })` →
  `pulls.setAutoMerge(pr, autoMerge)`. See
  [pr-head-rerooted-in-one-ref-move](../decisions/pr-head-rerooted-in-one-ref-move.md).

  `upsert` subsumes the pre-port `exists` / `create` / re-check-on-failure
  recovery: `GitHubError`'s `kind: "alreadyExists"` is structural, so a
  concurrent creator is recognized by the error's shape rather than by
  matching its prose (`src/services/ManifestCommitter.ts:76-79`).
  `setAutoMerge` is a separate call, not an option on `upsert`
  (`src/services/ManifestCommitter.ts:152-154`): the auto-merge call firing
  from a `tap` after the create would let an auto-merge failure surface as
  though opening the PR had failed. `commit` mode never reaches any of this.

The pr-mode branch is force-synced onto base every run: `land` roots the
head branch at base's current tip on every `pr`-mode run, discarding any
commits an earlier run left there. The `branch` input defaults to a fixed
name (`chore/repin-plugins`, `action.yml:48`) reused run over run, so
without this the branch accumulates commits against ever-staler bases until
the PR is unmergeable. See
[pr-head-branch-is-action-owned](../limitations/pr-head-branch-is-action-owned.md)
for the consequence and
[pr-head-rerooted-in-one-ref-move](../decisions/pr-head-rerooted-in-one-ref-move.md)
for why the reset and the commit are a single ref move rather than
reset-then-commit.

`resolveBaseBranch(input)` (`src/services/ManifestCommitter.ts`)
returns the explicit `base-branch` input when set, otherwise resolves the
repo's default branch via `GitHubRepository.defaultBranch`.

## Error taxonomy

Four action-domain tagged errors in `src/errors/errors.ts`: `InvalidInputError`,
`PluginNotFoundError`, `ManifestNotFoundError` (a patch targeted a
marketplace whose fixed-path manifest is not in the checkout), and
`ManifestValidationError`. The last three each carry `marketplace` and
`path`, so a multi-manifest run's failure names which file and which
marketplace it belongs to rather than only a plugin name.

Library failures are collapsed at the port into a single **`GitHubError`**,
which carries a structured `kind` (e.g. `"alreadyExists"`, `"notFound"`) so
call sites discriminate on shape rather than on error prose. The one
exception is the GraphQL-backed auto-merge path, which adds
`GitHubGraphQLError` — `land`'s error channel is
`GitHubError | GitHubGraphQLError | InvalidInputError`
(`src/services/ManifestCommitter.ts:97-103`), while `resolveBaseBranch`'s is
just `GitHubError` (`src/services/ManifestCommitter.ts:44`). See
[branch-on-github-error-kind](../conventions/branch-on-github-error-kind.md).

`land`'s own `InvalidInputError` is the one failure it raises itself:
**`pr` mode refuses a head branch equal to its base**
(`src/services/ManifestCommitter.ts:110-117`). `branch` and `base` are
independent inputs — the latter resolved from `base-branch` or the repo
default — so nothing structural prevents them colliding. If they did, the
single `GitBranch.upsert` would move the *base* branch to the new commit,
landing an unreviewed commit directly on it, and `PullRequest.upsert` would
only fail afterwards on a head equal to its base — the failure would arrive
after the write it exists to prevent. The guard runs before the commit is
built and lives in `land` rather than at the `program.ts` call site because
it protects the write, not the caller. Commit mode is deliberately
unaffected — it writes to `base` by design and never reads `branch`.

`Action.run` owns the exit code; misconfiguration dies at the layer
boundary via `Layer.orDie`; summary/comment writes demote to
`logWarning`.
