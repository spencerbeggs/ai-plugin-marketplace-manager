---
type: DataModel
title: Action Contract
description: The maintainer-side names-and-defaults source of truth `action.yml`, `inputs.ts`, and `pre.ts`/`program.ts` are checked against.
resource: ../../src/contract.ts
status: stable
generated:
  by: okfit/claude-code
  at: 2026-09-17T19:20:18Z
  body_sha256: 08d18999bce97d5f0ec4204fe2d24479d9e4901740a47b1dd3367bd023df3c7a
tags:
  - architecture
  - testing
---

# Action Contract

## Shape, from the maintainer's side

`src/contract.ts` is deliberately dependency-free — "a description of the
contract, not a participant in it" (`src/contract.ts:19-21`). It holds four
things:

- `INPUT_NAMES` — every input declared in `action.yml`, fifteen entries:
  `name`, `url`, `path`, `sha`, `json`, `mode`, `base-branch`, `branch`,
  `commit-message`, `pr-title`, `pr-body`, `auto-merge`, `dry-run`,
  `app-client-id`, `app-private-key` (`src/contract.ts:30-46`).
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

1. **`action.yml` ↔ `contract.ts`.** `action.yml` is parsed with `@effected/yaml`
   through a `Schema.Record`-based `ActionManifest` that models only
   `inputs`/`outputs` — deliberately loose, so unrelated manifest keys like
   `branding`/`runs` never become a second thing to maintain
   (`__test__/action-contract.test.ts:14-34`). Three assertions follow: the
   manifest's `inputs` keys equal `INPUT_NAMES` as sets, its `outputs` keys
   equal `OUTPUT_NAMES` as sets, and every input mirrored in `INPUT_DEFAULTS`
   has exactly that default in the manifest (`__test__/action-contract.test.ts:61-75`).
   A fourth assertion guards the reasoning `INPUT_DEFAULTS` is built on: every
   *other* optional input (excluding the two required app-credential inputs)
   still defaults to `""` in the manifest — so an unmirrored input quietly
   acquiring a real default would change behavior with nothing here to notice
   (`__test__/action-contract.test.ts:77-87`).
2. **`contract.ts` ↔ the source.** Because a name reaching `ActionInput.<accessor>("name")`
   or `outputs.set("name", ...)` is a string literal that appears in no type,
   the test can only find call sites by reading source text: it concatenates
   `src/inputs.ts`, `src/pre.ts`, and `src/program.ts` and regex-matches each
   `INPUT_NAMES` entry against an `ActionInput.\w+(...)` call, and each
   `OUTPUT_NAMES` entry against an `outputs\s*.\s*set\w*(...)` call — the
   whitespace tolerance matters because the formatter breaks the longest of
   these calls across a line (`__test__/action-contract.test.ts:36-55`, `90-103`).
3. **The derived schema locations ↔ the prose.** The code and the generated
   documents share one derivation (`HostedSchema.$id`, checked by
   `pnpm schema:check`), but `action.yml`'s `result` description and the
   README spell the URL and the document paths by hand, and a version bump
   that misses them fails nothing. The test asserts the `result` description
   contains `SCHEMA_URL`, the README quotes `SCHEMA_URL` as its example
   `$schema` and links `schemas/<fileName>` for both identities, and both
   URLs resolve to the versioned `schemas/1.0/` layout
   (`__test__/action-contract.test.ts:105-133`). See
   [effect-schemas](effect-schemas.md).

## What breaks if an entry is wrong

Adding or renaming an input in `action.yml` without updating `INPUT_NAMES`
(or the reverse) fails leg 1. Adding or renaming an input in `contract.ts`
and `action.yml` together but missing the call site in `inputs.ts`/`pre.ts`/
`program.ts` fails leg 2 — and is the failure mode `src/contract.ts:7-12`
calls out by name: "a perfectly type-correct action that reads an input
nobody supplies and quietly takes the default. There is no compile error and
no runtime error — just wrong behavior." See
[renamed-input-silently-takes-the-default](../gotchas/renamed-input-silently-takes-the-default.md).
