---
type: DataModel
title: Action Contract
description: The maintainer-side names-and-defaults source of truth `action.yml`, `inputs.ts`, and `pre.ts`/`program.ts` are checked against.
resource: ../../src/contract.ts
status: stable
generated:
  by: okfit/claude-code
  at: 2026-11-01T19:08:50Z
tags:
  - architecture
  - testing
integrity:
  generated:
    body: f5e9748c7ada18b0
---

# Action Contract

## Shape, from the maintainer's side

`src/contract.ts` is deliberately dependency-free — "a description of the
contract, not a participant in it". It holds four things:

- `INPUT_NAMES` — every input declared in `action.yml`, fifteen entries:
  `name`, `marketplace`, `path`, `sha`, `json`, `mode`, `base-branch`, `branch`,
  `commit-message`, `pr-title`, `pr-body`, `auto-merge`, `dry-run`,
  `app-client-id`, `app-private-key` (`src/contract.ts`). `url` was removed
  and `marketplace` added at v2 — see
  [url-and-schema-version-dropped](../decisions/url-and-schema-version-dropped.md).
- `OUTPUT_NAMES` — every output declared in `action.yml`, nine entries:
  `result`, `status`, `changed`, `mode`, `commit-sha`, `commit-url`,
  `pr-number`, `pr-url`, `plugins-updated` (`src/contract.ts:49-59`).
- `InputName`/`OutputName` — the two names narrowed to their declared-set
  union types (`src/contract.ts:61-65`).
- `INPUT_DEFAULTS` — the inputs whose `action.yml` default is something
  other than `""`: `mode: "commit"`, `branch: "chore/repin-plugins"`,
  `"auto-merge": "rebase"`, `"dry-run": "false"` (`src/contract.ts:81-86`).
  `dry-run` is deliberately spelled as the manifest's raw string; `inputs.ts`
  reads it through `ActionInput.boolean` and the contract test asserts the
  two agree once parsed (`src/contract.ts:78-79`).

An omitted input arrives to the code as `""` regardless of what the manifest
says, and `inputs.ts` treats `""` as "missing" uniformly — so mirroring an
empty default here would carry no information a reader needs. A *non-empty*
default is a real behavioral decision that used to exist twice (once in the
manifest, once as a literal in `inputs.ts`) with nothing keeping the two
honest; `INPUT_DEFAULTS` is the one place that decision now lives
(`src/contract.ts:67-80`).

## What is derived from it

`__test__/action-contract.test.ts` asserts a three-way agreement in two
legs, plus a third leg that pins the schema URLs the prose quotes:

1. **`action.yml` ↔ `contract.ts`.** `action.yml` is decoded with the kit's
   `ActionManifest.decodeResult` from `@effected/github-actions`, which models
   the manifest's `inputs`/`outputs` maps without this test maintaining a
   schema of its own (`__test__/action-contract.test.ts:20-30`). Three
   assertions follow: the manifest's `inputs` keys equal `INPUT_NAMES` as
   sets, its `outputs` keys equal `OUTPUT_NAMES` as sets, and every input
   mirrored in `INPUT_DEFAULTS` has exactly that default in the manifest
   (`__test__/action-contract.test.ts:91-105`).
   A fourth assertion guards the reasoning `INPUT_DEFAULTS` is built on: every
   *other* optional input (excluding the two required app-credential inputs)
   still defaults to `""` in the manifest — so an unmirrored input quietly
   acquiring a real default would change behavior with nothing here to notice
   (`__test__/action-contract.test.ts:107-117`).
2. **`action.yml` ↔ the code.** A name reaching `ActionInput.<accessor>("name")`
   or `outputs.set("name", ...)` is a string literal that appears in no type,
   so the test observes the calls by running the code rather than reading its
   source. Reads are recorded with
   `ActionInput.recording(ActionManifest.runnerInputs(manifest, supplied))`
   while `parseInputs` runs on the manual path with one valid patch, followed
   by `readAppCredentials` — the effect `src/pre.ts` exports and `pre` yields,
   so the two credential reads are recorded without minting a token. Writes
   are recorded with `ActionOutputs.recording()` while `program` runs with no
   inputs at all: the XOR check fails first, and the failure path emits all
   nine outputs through the same `emit` the success path uses, with every
   other service a `layerTest()` double that dies if reached
   (`__test__/action-contract.test.ts:31-85`). The test then asserts
   `ActionManifest.diff(...)` reports empty `unreadInputs`/`undeclaredInputs`
   and `unwrittenOutputs`/`undeclaredOutputs` lists, so the failure names the
   offending input or output (`__test__/action-contract.test.ts:120-140`).
   Recording is dynamic: it sees only the reads and writes on the path the
   run actually takes. That is why the input run uses the manual path with a
   valid patch — it carries `parseInputs` past every later read — and why a
   new input read only on some other branch would need the recorded run
   steered onto that branch too.
3. **The derived schema locations ↔ the prose.** The code and the generated
   documents share one derivation (`HostedSchema.$id`, checked by
   `pnpm schema:check`), but `action.yml`'s `result` description and the
   README spell the URL and the document paths by hand, and a version bump
   that misses them fails nothing. The test asserts the `result` description
   contains `SCHEMA_URL`, the README quotes `SCHEMA_URL` as its example
   `$schema` and links `schemas/<fileName>` for both identities, and both
   URLs resolve to the versioned `schemas/2.0/` layout
   (`__test__/action-contract.test.ts:142-170`). See
   [effect-schemas](effect-schemas.md).

## What breaks if an entry is wrong

Adding or renaming an input in `action.yml` without updating `INPUT_NAMES`
(or the reverse) fails leg 1. Adding or renaming an input in `contract.ts`
and `action.yml` together but missing the call site in `inputs.ts`/`pre.ts`/
`program.ts` fails leg 2 — and is the failure mode `src/contract.ts:7-12`
calls out by name: "a perfectly type-correct action that reads an input
nobody supplies and quietly takes the default. There is no compile error and
no runtime error — just wrong behavior." Leg 2 has been mutation-checked
against both halves: renaming the `pr-body` read in `inputs.ts` and deleting
the `pr-url` write in `program.ts` each fail it, naming the input or output.
A call site reached only off the recorded paths would not, which is the
dynamic-recording caveat above. See
[renamed-input-silently-takes-the-default](../gotchas/renamed-input-silently-takes-the-default.md).
