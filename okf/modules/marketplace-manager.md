---
type: Module
title: marketplace-manager
description: The GitHub Action's src/ tree — the three-phase lifecycle, the program.ts orchestration pipeline, layer composition, and the landing/mode split.
kind: action
resource: ../../src
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: c536e28d8ea974f7d3d5b5fab9f8ac1eefa6157627c99400036a247414edf4e7
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

`program` (`src/program.ts:157-173`) wraps `parseInputs` and the
orchestration body (`runOrchestration`, `src/program.ts:66-149`) each in
`Effect.exit`. On a typed failure at either stage it emits a structured
failed `result` (`status: "failed"`, `hasFailures: true`, `succeeded: false`)
via `emitFailure` (`src/program.ts:49-63`), then re-raises with
`Effect.failCause` so the action still exits non-zero.

**`emitFailure` swallows its own failures, and that is enforced in the
helper rather than assumed at the call sites.** Both callers run it before
re-raising the cause that actually failed the run, so anything escaping it
would short-circuit the `yield*` and take the place of that cause — the run
would report an output-write problem instead of the validation or API error
it exists to report. `emit` (`src/program.ts:14-30`) guards its own
`setJson` and `summary` calls, but the eight plain `outputs.set` writes
between them are unguarded and each touches the runner's file descriptor, so
this is reachable rather than theoretical. `emitFailure` is therefore
wrapped in `Effect.catchCause` rather than `Effect.catch`
(`src/program.ts:63`), because a defect displaces the real cause just as
effectively as a typed failure — see
[test-doubles-transform-and-fixtures-isolate](../conventions/test-doubles-transform-and-fixtures-isolate.md)
for how this is pinned by a fault-injection test.

The full logical pipeline, in order (step 1 in `program`, steps 2–9 in
`runOrchestration`):

1. **Parse inputs** (`parseInputs`, `src/inputs.ts:45-147`) → a normalized
   `ParsedInputs` with a `patches` array, enforcing the manual/`json` XOR
   (`src/inputs.ts:53-65`). See
   [action-inputs](../interfaces/action-inputs.md).
2. **Read manifest** (`readManifest`, `src/services/ManifestEditor.ts:112-113`)
   from the checkout.
3. **Apply patches** (`applyPatches`, `src/services/ManifestEditor.ts:55-105`)
   — format-preserving partial-merge via `@effected/jsonc`, matched by
   plugin name. An unknown name fails with `PluginNotFoundError`
   (`src/services/ManifestEditor.ts:79-82`). See
   [patch](../glossary/patch.md).
4. **No-op guard** (`src/program.ts:72-87`). If the edited text equals the
   original, emit a `noop` result and stop — no validation, no commit.
   `EditResult` is a union discriminated on `changed`
   (`src/services/ManifestEditor.ts:38`), so this guard is also what
   narrows the edit to the `ChangedEdit` that step 5 requires.
5. **Validate the result** (`validateEdit`, `src/services/ManifestValidator.ts`)
   before any commit, returning the branded `ValidatedManifestChange` that
   `land` requires (`src/program.ts:89-97`). See
   [validate-the-result-before-landing](../conventions/validate-the-result-before-landing.md).
6. **Dry-run guard** (`src/program.ts:99-114`). If `dryRun`, emit the
   summary/output and stop before landing. Dry-run never reads the token
   identity, so no provisioned token is required on that path.
7. **Build default messages** (`src/program.ts:116-122`).
   `GitHubToken.botIdentity()` feeds the DCO trailer only; the commit
   subject/body come from the change set. This runs only on the land path.
8. **Land** (`land`, `src/services/ManifestCommitter.ts:90-155`) per `mode`
   (commit or PR).
9. **Emit** (`src/program.ts:137-148`) the structured `result` output,
   convenience scalars, and a job summary — both non-fatal.

## Module layout (`src/`)

| Area | Files | Role |
| --- | --- | --- |
| Lifecycle | `pre.ts`, `main.ts`, `post.ts` | Phase entrypoints. |
| Orchestration | `program.ts` | The main pipeline (above). |
| Inputs | `inputs.ts` | `parseInputs` → `ParsedInputs`; enforces the XOR. |
| Contract | `contract.ts` | The declared input/output names and non-empty defaults; dependency-free. See [action-contract](../models/action-contract.md). |
| Errors | `errors/errors.ts` | Tagged errors: `InvalidInputError`, `PluginNotFoundError`, `ManifestValidationError`. |
| Schema | `schema/marketplace.ts`, `schema/input.ts`, `schema/report-output.ts`, `schema/projections.ts` | Effect Schemas (source of truth) plus the pure output projection. See [effect-schemas](../models/effect-schemas.md). |
| Services | `services/ManifestEditor.ts`, `services/ManifestValidator.ts`, `services/ManifestCommitter.ts` | Read/edit, validate, and land. |
| Report | `report.ts` | Pure default-message and job-summary builders. |
| Wiring | `layers/app.ts`, `state.ts` | `PreLive`/`MainLive`/`PostLive` layers; cross-phase start-time state (`src/state.ts:4-11`). |

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

`land(params)` (`src/services/ManifestCommitter.ts:90-155`) owns the mode
split. It never passes author, committer, or signature — see
[verified-commit](../glossary/verified-commit.md).

- **commit mode** (`src/services/ManifestCommitter.ts:112-119`):
  `commit.commitFiles({ branch: base, message, changes })` directly on the
  base branch — `commitFiles` reads the base head as parent itself.
  `changes` carries a `FileContent` instance, not a bare
  `{ path, content }` literal.
- **pr mode** (`src/services/ManifestCommitter.ts:122-147`) — the commit is
  built before the ref moves:
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
  matching its prose (`src/services/ManifestCommitter.ts:75-78`).
  `setAutoMerge` is a separate call, not an option on `upsert`
  (`src/services/ManifestCommitter.ts:145-147`): the auto-merge call firing
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

`resolveBaseBranch(input)` (`src/services/ManifestCommitter.ts:43-44`)
returns the explicit `base-branch` input when set, otherwise resolves the
repo's default branch via `GitHubRepository.defaultBranch`.

## Error taxonomy

Three action-domain tagged errors in `src/errors/errors.ts`:
`InvalidInputError` (`:4-11`), `PluginNotFoundError` (`:14-20`), and
`ManifestValidationError` (`:23-29`).

Library failures are collapsed at the port into a single **`GitHubError`**,
which carries a structured `kind` (e.g. `"alreadyExists"`, `"notFound"`) so
call sites discriminate on shape rather than on error prose. The one
exception is the GraphQL-backed auto-merge path, which adds
`GitHubGraphQLError` — `land`'s error channel is
`GitHubError | GitHubGraphQLError | InvalidInputError`
(`src/services/ManifestCommitter.ts:90-96`), while `resolveBaseBranch`'s is
just `GitHubError` (`src/services/ManifestCommitter.ts:43`). See
[branch-on-github-error-kind](../conventions/branch-on-github-error-kind.md).

`land`'s own `InvalidInputError` is the one failure it raises itself:
**`pr` mode refuses a head branch equal to its base**
(`src/services/ManifestCommitter.ts:103-110`). `branch` and `base` are
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
