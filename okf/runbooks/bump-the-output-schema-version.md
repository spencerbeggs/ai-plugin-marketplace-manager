---
type: Runbook
title: Bump the output schema version
description: Respond to a contract change in a published JSON Schema label by bumping OUTPUT_SCHEMA_VERSION, keeping the old label frozen in OUTPUT_SCHEMA_VERSIONS, regenerating with the schemastore CLI, and updating the prose Leg 3 pins.
resource: ../../src/schema/input.ts
status: stable
tags:
  - release
  - compat
sources:
  - id: input-schema
    resource: ../../src/schema/input.ts
    title: "OUTPUT_SCHEMA_VERSION and OUTPUT_SCHEMA_VERSIONS"
  - id: schemastore-config
    resource: ../../lib/scripts/schemastore.config.ts
    title: "the published flag per entry"
  - id: schemastore-cli-readme
    resource: npm:@effected/schemastore-cli
    title: "drift policy, frozen labels, and exit codes"
generated:
  by: okfit/claude-code
  at: 2026-09-17T19:20:18Z
  body_sha256: 86e1d18e8b69d8cf357286437979a20d9263a21a75d9b69d1bc02a6381883889
---

# Bump the output schema version

## Trigger

Either of:

- `pnpm schema:build` (or `pnpm schema:check`) exits `1` reporting **drift**
  on `output` or `input` — the entry is `published: true` in
  `lib/scripts/schemastore.config.ts`[^schemastore-config] and the
  regenerated document's contract differs from the committed one. The error
  line names the `$id`, the change class, the current label, and the
  suggested next label.[^schemastore-cli-readme]
- You have made a contract-shaped change to `ReportOutput`
  (`src/schema/report-output.ts`) or `JsonInput` (`src/schema/input.ts`) —
  adding, removing, or retyping a field, changing an enum's members, or
  anything else `@effected/schemastore`'s `DocumentDiff` classifies as
  `"contract"` rather than `"annotations"` — at a label consumers already
  depend on.

While the current label is **unpublished** (`published: false`, the state
today — `1.0` has never shipped; `lib/scripts/schemastore.config.ts:60`,
`65`), no bump is needed: `pnpm schema:build` rewrites the document in
place at the same label. This runbook is for the moment a label has
shipped.

## Steps

1. Run `pnpm schema:check`. It runs the identical walk with no writes and
   reports, per schema, unchanged, would-write, or drift, and exits `1` when
   a build would write or refuse anything — the same information the
   enforcing run acts on, surfaced safely first.
2. If a document reports drift, bump the label to the one the error
   suggested, or higher: the suggestion is a minor bump, and `DocumentDiff`
   cannot tell an additive change from a breaking one, so bump major by
   hand when you know it is breaking. Both edits are in
   `src/schema/input.ts`[^input-schema]:
   - `OUTPUT_SCHEMA_VERSION` (`src/schema/input.ts:13`) — a `major.minor`
     label. Both identities are built from it, so `SCHEMA_URL`,
     `INPUT_SCHEMA_URL`, and both config entries' current label move with
     it.
   - `OUTPUT_SCHEMA_VERSIONS` (`src/schema/input.ts:20`) — keep the old label
     in the array alongside the new one. The old label becomes a **frozen**
     version whose file the CLI verifies still exists and still declares
     exactly its derived `$id`, but never regenerates; advertising a label
     with nothing on disk, or with a file whose `$id` is absent or
     different, fails the pre-flight before anything is written. A change to
     the hosting (`repo`, `branch`, or `path` in `HostedSchema.github`)
     therefore moves every frozen label's `$id` and is a re-publish event
     for all of them.
   Leave `published: true` on the entries — a new label has no predecessor
   on disk, so its first write is `created`, never drift.
3. Run `pnpm schema:build`. The new label writes
   `schemas/<version>/output.json` and `schemas/<version>/input.json`; the
   previous label's files under `schemas/<old-version>/` are untouched.
4. Update the prose that spells the URL and paths by hand: `action.yml`'s
   `result` description (`action.yml:79-82`) and the README's example
   `$schema` and the two `schemas/<version>/…` document links
   (`README.md:137`, `153`, `167`). Leg 3 of
   `__test__/action-contract.test.ts` fails until they match `SCHEMA_URL`,
   `INPUT_SCHEMA_URL`, and each identity's `fileName`
   (`__test__/action-contract.test.ts:105-133`).
5. Run `pnpm schema:check` again and `pnpm test`. The check fails on a stale
   or missing document, on a frozen file whose `$id` is absent or differs
   from the derived one, and on any gate failure; the test pins the prose.
6. Add a changeset describing the schema version bump — the emitted
   `$schema` value changes, which consumers see.

**The `--force` escape hatch** (`pnpm schema:build --force`, sugar for
`--drift=allow`) rewrites a published document in place at the **same**
label instead of writing a new one — skip it unless you are repairing a
document whose committed text no longer parses. Using it against a label
consumers already depend on breaks every consumer pinned to that version's
`$schema` URL.

## End state

`pnpm schema:check` reports every schema unchanged and exits `0`, `pnpm test`
is green, and the repository has a new `schemas/<version>/` pair committed
alongside the previous label's files, which are unchanged and now listed as
a frozen label in `OUTPUT_SCHEMA_VERSIONS`. The changeset for the bump is in
place.

See also: [versioned-schema-documents](../decisions/versioned-schema-documents.md),
[effect-schemas](../models/effect-schemas.md),
[result-output](../interfaces/result-output.md).

[^input-schema]: `../../src/schema/input.ts`
[^schemastore-config]: `../../lib/scripts/schemastore.config.ts`
[^schemastore-cli-readme]: `npm:@effected/schemastore-cli`
