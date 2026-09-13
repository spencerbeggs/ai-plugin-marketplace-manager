# CLAUDE.md

## Project

`marketplace-manager` is a GitHub Action that edits a Claude Code plugin
**marketplace manifest** (`.claude-plugin/marketplace.json`) in place. It
partial-merge updates existing `git-subdir` plugin entries (any subset of
`url`/`path`/`sha`), validates the result (ajv structural + semantic), and lands
the change as a **verified** commit — directly on the base branch (`commit`
mode) or via a pull request (`pr` mode).

Precision by design: apply **only explicit values**. No release lookup or
ref→sha resolution.

## Stack

- Effect v4 + `@effected/github-actions` (runner) and `@effected/github` (API).
- `@effected/jsonc` for format-preserving edits; `ajv` for manifest validation.
- Versions come from pnpm catalogs, not this file — read the installed one from
  the lockfile, and re-pin the vendored source in `.repos/config.json` (which
  tracks the installed `effect` / `@effected/github-actions`) when they bump.
- Bundled to a committed `dist/` by `@savvy-web/github-action-builder`.
- Node ≥ 24.11; pnpm; Biome; Vitest (`@effected/yaml` is test-only — it parses
  `action.yml`).

## Commands

- `pnpm build` — bundle `src/` → `dist/` (run before committing action changes).
- `pnpm test` / `pnpm test:coverage` — Vitest.
- `pnpm typecheck` — `tsc --noEmit` via turbo.
- `pnpm lint` / `pnpm lint:fix` — Biome. `pnpm lint:md` — markdownlint.
- `pnpm generate-schema` — regenerate the committed root JSON Schemas.
- `pnpm validate` — validate `action.yml`.

## Conventions & gotchas

- **Never** stamp `botIdentity()` onto author/committer/signature fields —
  server-side signing is what makes commits verified. The bot identity feeds the
  DCO `Signed-off-by:` trailer (commit message text) only. `@effected/github`'s
  `GitCommit` exposes no such parameter, so the rule is now structural too —
  don't reintroduce a path that could stamp one
  (`@okf/conventions/never-stamp-bot-identity-on-commits.md`).
- Inputs are a manual/`json` **XOR**, enforced in `inputs.ts`; both normalize to
  `ParsedInputs.patches` (`@okf/interfaces/action-inputs.md`).
- Validate the edited **result** before any commit; no-op guard skips validation
  and landing when the text is byte-stable. Both halves are **type-enforced**:
  `EditResult` is a `NoopEdit | ChangedEdit` union, and `land` requires the
  branded `ValidatedManifestChange` that only `validateEdit` mints — so don't
  reach for `validateManifest` + a raw string at a call site
  (`@okf/conventions/validate-the-result-before-landing.md`).
- `pr` mode **force-resets** the head branch onto `base` every run, discarding
  any earlier run's commits. Deliberate: `branch` defaults to a fixed name, and
  without the reset the PR drifts until it conflicts. A human commit on that
  branch is collateral — it's action-owned. The reset is expressed as a **single
  `GitBranch.upsert` to the already-built commit** — never `upsert` to the base
  head followed by a commit, which would leave the head branch briefly equal to
  base and get the open PR auto-closed for an empty diff
  (`@okf/decisions/pr-head-rerooted-in-one-ref-move.md`).
- The installation token is always revoked in `post` — no opt-out. `pre` mints
  it via `GitHubToken.provision` (App credentials passed explicitly; private key
  stays `Redacted`) and persists it to cross-phase state; `main` reads it back
  through `GitHubToken.clientLayer()` (`@okf/invariants/post-revokes-the-token-first.md`).
- Failures arrive as a single `GitHubError` with a structured `kind` (plus
  `GitHubGraphQLError` on the auto-merge path). Branch on `kind` — never match
  error prose (`@okf/conventions/branch-on-github-error-kind.md`).
- `src/contract.ts` declares every input/output **name** and every non-empty
  default. `inputs.ts` imports `INPUT_DEFAULTS` outright; the names themselves
  are still string literals at the call sites (`inputs.ts`, `pre.ts`,
  `program.ts`), so what actually holds `action.yml`, `contract.ts` and those
  literals together is `__test__/action-contract.test.ts`. Adding or renaming
  an input means editing all three — the failure is otherwise silent: a rename
  in `action.yml` alone leaves the code reading an input nobody supplies and
  quietly taking the default. No compile or runtime error
  (`@okf/conventions/keep-the-action-contract-in-sync.md`,
  `@okf/gotchas/renamed-input-silently-takes-the-default.md`).
- Each entry point (`pre.ts`/`main.ts`/`post.ts`) ends in an
  `if (process.env.GITHUB_ACTIONS)` guard, and `vitest.setup.ts` strips the
  runner environment (`GITHUB_*`, `INPUT_*`, `STATE_*`) in `globalSetup` before
  the forks pool spawns. They only work as a pair — drop either and importing
  an entry point in a test executes a real phase on a runner
  (`@okf/conventions/entry-point-guard-and-env-strip-are-a-pair.md`).
- Test doubles must perform the transformations the real implementation
  performs (the `ActionOutputs` `setJson` double encodes through the schema),
  and validation fixtures must be structurally valid except in the field under
  test. Both rules are load-bearing: a double that skipped the encode and a
  fixture that failed on the wrong field each kept a dead test green
  (`@okf/conventions/test-doubles-transform-and-fixtures-isolate.md`).
- Effect Schemas are the source of truth; the root `*.input.json` /
  `*.output.json` schemas are generated and **drift-tested** — regenerate after
  schema changes, don't hand-edit (`@okf/models/effect-schemas.md`,
  `@okf/gotchas/effect-rc113-opened-generated-json-schema-objects.md`).

## Bundle

Deeper architecture, rationale, and contracts live under `okf/`, an OKF
knowledge bundle managed with [okfit](https://github.com/spencerbeggs/okfit).
Start at `@okf/index.md` for the full concept index; the pointers below cover
the areas the bullets above only summarize.

- **Architecture** — `@okf/modules/marketplace-manager.md`: the pre/main/post
  phases, `program.ts` orchestration, layer composition, and the landing/mode
  split.
- **Verified commits** — `@okf/decisions/verified-commits-via-server-side-signing.md`,
  `@okf/conventions/never-stamp-bot-identity-on-commits.md`,
  `@okf/invariants/commit-calls-carry-no-identity.md`.
- **Input/output contracts** — `@okf/interfaces/action-inputs.md`,
  `@okf/interfaces/result-output.md`, `@okf/models/action-contract.md`,
  `@okf/models/effect-schemas.md`,
  `@okf/conventions/keep-the-action-contract-in-sync.md`.
- **Manifest validation** — `@okf/conventions/validate-the-result-before-landing.md`,
  `@okf/decisions/ajv-strict-false.md`,
  `@okf/invariants/landing-requires-a-validated-non-noop-change.md`.
- **Edges and traps** — `@okf/limitations/`, `@okf/gotchas/`, `@okf/glossary/`
  (`verified-commit`, `patch`), and the two downstream repos that run this
  action under `@okf/consumers/`.
