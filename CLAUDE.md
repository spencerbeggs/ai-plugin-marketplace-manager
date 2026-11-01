# CLAUDE.md

## Project

`ai-plugin-marketplace-manager` is a GitHub Action that edits, in place, the
Claude Code marketplace manifest (`.claude-plugin/marketplace.json`,
`git-subdir` entries) and/or the GitHub Copilot marketplace manifest
(`.github/plugin/marketplace.json`, `github` entries) — both fixed paths, no
discovery. It partial-merge updates existing entries named per marketplace,
setting `sha` (and optionally `path`), validates every touched manifest (ajv
structural + semantic) before anything is committed, and lands all of them as
one **verified** commit — directly on the base branch (`commit` mode) or via a
pull request (`pr` mode).

Precision by design: apply **only explicit values**. No release lookup or
ref→sha resolution.

## Stack

- Effect v4 + `@effected/github-actions` (runner) and `@effected/github` (API).
- `@effected/jsonc` for format-preserving edits; `ajv` for manifest validation.
- `@effected/schemastore` (runtime `HostedSchema` identities) and
  `@effected/schemastore-cli` (dev) generate the two JSON Schema documents
  under `schemas/<version>/` from `lib/scripts/schemastore.config.ts`.
- Versions come from pnpm catalogs, not this file — read the installed one from
  the lockfile, and re-pin the vendored source in `.repos/config.json` (which
  tracks the installed `effect` / `@effected/github-actions`) when they bump.
- Bundled to a committed `dist/` by `@savvy-web/github-action-builder`.
- Node ≥ 24.11; pnpm; Biome; Vitest (`@effected/memfs` is test-only — the
  in-memory checkout the filesystem tests run against).

## Commands

- `pnpm build` — bundle `src/` → `dist/` (run before committing action changes).
- `pnpm test` / `pnpm test:coverage` — Vitest.
- `pnpm typecheck` — `tsc --noEmit` via turbo.
- `pnpm lint` / `pnpm lint:fix` — Biome. `pnpm lint:md` — markdownlint.
- `pnpm schema:build` / `pnpm schema:check` — regenerate / verify the committed
  `schemas/2.0/{input,output}.json` (`schema:check` runs first in `ci:test`).
  `schemas/1.0/` is a frozen label: checked for its `$id`, never regenerated.
- `pnpm validate` — validate `action.yml`.

## Conventions & gotchas

- **Never** stamp `botIdentity()` onto author/committer/signature fields —
  server-side signing is what makes commits verified. The bot identity feeds the
  DCO `Signed-off-by:` trailer (commit message text) only. `@effected/github`'s
  `GitCommit` exposes no such parameter, so the rule is now structural too —
  don't reintroduce a path that could stamp one
  (`@okf/conventions/never-stamp-bot-identity-on-commits.md`).
- Inputs are a manual/`json` **XOR**, enforced in `inputs.ts`; manual-path
  detection looks only at `name`/`sha`/`path` — never `marketplace`, which a
  defaulted `workflow_dispatch` choice input always supplies — and both paths
  normalize to `ParsedInputs.patches` (`@okf/interfaces/action-inputs.md`,
  `@okf/gotchas/marketplace-input-ignored-for-manual-path-detection.md`).
  `JsonInput.plugins` is `Schema.NonEmptyArray(...)`, which lowers to a
  plain `minItems: 1` since `@effected/schemastore` 0.28 (effected#818).
- Validate the edited **result** before any commit; no-op guard skips validation
  and landing when a manifest's text is byte-stable. Both halves are
  **type-enforced**: `EditResult` is a `NoopEdit | ChangedEdit` union per
  manifest, and `land` requires a **non-empty array** of the branded
  `ValidatedManifestChange` that only `validateEdit` mints — one entry per
  changed manifest — so don't reach for `validateManifest` + a raw string at a
  call site (`@okf/conventions/validate-the-result-before-landing.md`).
  Every touched manifest lands in **one** commit, never one per file
  (`@okf/decisions/multi-marketplace-repins-land-as-one-commit.md`), and
  `claude-code`/`copilot` each map to one fixed manifest path with no
  discovery (`@okf/decisions/fixed-manifest-paths-per-marketplace.md`).
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
  performs (outputs are recorded with the kit's `ActionOutputs.recording()`,
  whose `setJson` encodes through the schema — never a hand-written override),
  and validation fixtures must be structurally valid except in the field under
  test. Both rules are load-bearing: a double that skipped the encode and a
  fixture that failed on the wrong field each kept a dead test green
  (`@okf/conventions/test-doubles-transform-and-fixtures-isolate.md`).
- Effect Schemas are the source of truth; `schemas/2.0/{input,output}.json`
  are generated by the schemastore CLI and **drift-checked** by
  `pnpm schema:check` in `ci:test` — run `pnpm schema:build` after schema
  changes, don't hand-edit. `schemas/1.0/` is a frozen label in
  `OUTPUT_SCHEMA_VERSIONS`: the CLI checks its `$id` but never regenerates it.
  The `$schema` URLs are one `HostedSchema`
  derivation (`OutputSchemaIdentity`/`InputSchemaIdentity` in
  `src/schema/input.ts`), and Leg 3 of `action-contract.test.ts` pins the
  hand-spelled copies in `action.yml` and the README; a contract change at a
  published label is answered by bumping `OUTPUT_SCHEMA_VERSION`, never by
  rewriting in place (`@okf/models/effect-schemas.md`,
  `@okf/decisions/versioned-schema-documents.md`,
  `@okf/runbooks/bump-the-output-schema-version.md`). At the repo rename
  the frozen 1.0 files' `$id` was hand-rewritten to the new name (the CLI
  derives every tracked label's `$id` from the current repo), while their
  `$schema` enum keeps the old URL v1 payloads emit; `url`/the in-band
  `schemaVersion` are both gone
  (`@okf/decisions/repository-renamed-1-0-schema-ids-rewritten.md`,
  `@okf/decisions/url-and-schema-version-dropped.md`).

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
  `@okf/conventions/keep-the-action-contract-in-sync.md`,
  `@okf/decisions/versioned-schema-documents.md`,
  `@okf/runbooks/bump-the-output-schema-version.md`.
- **Manifest validation** — `@okf/conventions/validate-the-result-before-landing.md`,
  `@okf/decisions/ajv-strict-false.md`,
  `@okf/invariants/landing-requires-a-validated-non-noop-change.md`.
- **Edges and traps** — `@okf/limitations/`, `@okf/gotchas/`, `@okf/glossary/`
  (`verified-commit`, `patch`), and the two downstream repos that run this
  action under `@okf/consumers/`.
