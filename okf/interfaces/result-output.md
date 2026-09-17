---
type: Interface
title: Result Output
description: The structured `result` output and its convenience scalars.
kind: wire
resource: ../../schemas/1.0/output.json
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-17T19:20:18Z
  body_sha256: adecad515b11eddb80632a36fb48b6a53cd18f392f1f4bbb99e711f30ea6a42d
tags:
  - architecture
  - observability
---

# Result Output

## The `result` output

`result` is `ReportOutput` (`src/schema/report-output.ts:40-62`), built by the
pure `toReportOutput` projection in `src/schema/projections.ts:38-55`. Its
shape:

- `$schema` — the hosted schema URL, first field, always
  `https://raw.githubusercontent.com/spencerbeggs/claude-code-marketplace-manager/main/schemas/1.0/output.json`
  — `SCHEMA_URL`, the `$id` of `OutputSchemaIdentity`'s current document
  rather than a string literal, so the URL a payload carries and the `$id`
  the committed document declares are one value
  (`src/schema/report-output.ts:13`, `44`). The `1.0` in the path is the
  hosted document's label, a different thing from `schemaVersion`; a
  contract change at a published label moves it, and an old payload's URL
  keeps resolving to the shape it was written against — see
  [versioned-schema-documents](../decisions/versioned-schema-documents.md).
- `schemaVersion` — an in-band literal `"1"`, bumped only on a breaking shape
  change (`src/schema/report-output.ts:16`, `45`).
- Three orthogonal booleans plus `dryRun`: `noop`, `succeeded`, `hasFailures`,
  `dryRun` (`src/schema/report-output.ts:48-51`). `noop` is true when the
  change set is empty (`src/schema/projections.ts:40`).
- `mode` — `"commit" | "pr"`, the mode the run actually used
  (`src/schema/report-output.ts:46`).
- `status` — a derived human label, never set directly:
  `!succeeded ⇒ "failed"`, else `noop ⇒ "no-op"`, else `"success"`
  (`deriveStatus`, `src/schema/projections.ts:18-19`).
- Payload: `pluginsUpdated` (count of distinct plugins touched), `plugins`
  (`{ name, fields[] }` grouped per plugin, order preserved), `commit`
  (`{ sha, url } | null`), `pr` (`{ number, url } | null`)
  (`src/schema/report-output.ts:52-55`; `src/schema/projections.ts:21-53`).

## Failure states are actually emitted

A typed failure — input parsing, validation, or landing — still produces a
structured failed `result` before the run re-raises the cause and exits
non-zero. `program.ts` wraps both `parseInputs` and `runOrchestration` in
`Effect.exit`, and on `Exit.isFailure` calls `emitFailure` before
re-`failCause`-ing (`src/program.ts:160-172`). `emitFailure` projects
`succeeded: false, hasFailures: true` with empty `changes` and null
commit/PR fields, then wraps the whole emission in `Effect.catchCause` so
that even a failure to emit the failure result cannot displace the real
cause the run is failing on (`src/program.ts:49-63`).

## Convenience scalar outputs

Alongside `result`, `emit` writes eight plain scalar outputs so a caller
doesn't have to parse JSON for the common facts: `status`, `changed`
(`succeeded && !noop`), `mode`, `commit-sha`, `commit-url`, `pr-number`,
`pr-url`, `plugins-updated` (`src/program.ts:14-30`; declared in
`action.yml:83-98`). Each of `commit-sha`/`commit-url`/`pr-url` falls back to
`""` and `pr-number` to `""` when the corresponding struct is `null`
(`src/program.ts:22-25`).

## Job summary

`emit` also writes a non-fatal markdown job summary via
`outputs.summary(buildSummary(output))`, guarded the same way as the
`result` write — a summary failure only logs a warning, it never fails the
run (`src/program.ts:16-29`). `buildSummary` renders a property table
(status, mode, plugins updated, dry run, and commit/PR rows when present)
plus a bullet list of touched plugins (`src/report.ts:47-68`).

## Default messages

When `commit-message`/`pr-title`/`pr-body` are unset, `src/report.ts`
generates them from the applied `ChangeRecord[]`:

- `commitSubject` — `ai(marketplace): repinned <plugin>@<manifest>` for a
  single plugin, or `ai(marketplace): repinned <N> plugins` for more than one
  (`src/report.ts:28-35`).
- `messageBody` — one bullet per changed field, per plugin, e.g. `- pinned
  <plugin>@<manifest> to <value>` for `sha` (`src/report.ts:15-25`, `38`).
- `defaultCommitMessage` — subject, blank line, body, blank line, and a DCO
  `Signed-off-by: <bot.name> <bot.email>` trailer. The DCO trailer is added
  to the **commit message text only** — it is never used to stamp
  author/committer/signature fields (`src/report.ts:40-44`).
