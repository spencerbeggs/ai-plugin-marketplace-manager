---
type: Interface
title: Result Output
description: The structured `result` output and its convenience scalars.
kind: wire
resource: ../../schemas/2.0/output.json
status: stable
generated:
  by: okfit/claude-code
  at: 2026-11-01T19:21:18Z
tags:
  - architecture
  - observability
integrity:
  generated:
    body: 08b1ee1df41ae298
---

# Result Output

## The `result` output

`result` is `ReportOutput` (`src/schema/report-output.ts`), built by the
pure `toReportOutput` projection in `src/schema/projections.ts`. Its shape:

- `$schema` — the hosted schema URL, first field, always
  `https://raw.githubusercontent.com/spencerbeggs/ai-plugin-marketplace-manager/main/schemas/2.0/output.json`
  — `SCHEMA_URL`, the `$id` of `OutputSchemaIdentity`'s current document
  rather than a string literal, so the URL a payload carries and the `$id`
  the committed document declares are one value. The `2.0` in the path is
  the hosted document's label; a contract change at a published label moves
  it, and an old payload's URL keeps resolving to the shape it was written
  against — see
  [versioned-schema-documents](../decisions/versioned-schema-documents.md).
  **There is no in-band `schemaVersion` field** — the version lives only in
  the `$schema` URL's `schemas/<version>/` path; see
  [url-and-schema-version-dropped](../decisions/url-and-schema-version-dropped.md).
- Three orthogonal booleans plus `dryRun`: `noop`, `succeeded`, `hasFailures`,
  `dryRun`. `noop` is true when every targeted manifest turned out
  byte-stable (the combined change set across all manifests is empty).
- `mode` — `"commit" | "pr"`, the mode the run actually used.
- `status` — a derived human label, never set directly:
  `!succeeded ⇒ "failed"`, else `noop ⇒ "no-op"`, else `"success"`
  (`deriveStatus`, `src/schema/projections.ts`).
- Payload: `pluginsUpdated` (count of distinct `(marketplace, name)` pairs
  touched, across both manifests), `plugins` (`{ marketplace, manifest,
  name, fields[] }` grouped per pair, order preserved — grouping by the pair
  rather than by name alone, because the same plugin repinned in both
  marketplaces in one run is two entries, not one merged entry),
  `manifests` (the distinct manifest file paths the run touched, first-seen
  order), `commit` (`{ sha, url } | null`), `pr` (`{ number, url } | null`)
  (`src/schema/report-output.ts`; `src/schema/projections.ts`).

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
  "commit": { "sha": "<40-hex>", "url": "<commit html url>" },
  "pr": null
}
```

## Failure states are actually emitted

A typed failure — input parsing, validation, or landing — still produces a
structured failed `result` before the run re-raises the cause and exits
non-zero. `program.ts` wraps both `parseInputs` and `runOrchestration` in
`Effect.exit`, and on `Exit.isFailure` calls `emitFailure` before
re-`failCause`-ing. `emitFailure` projects `succeeded: false, hasFailures:
true` with an empty `changes` set (so `plugins: []`, `manifests: []`) and
null commit/PR fields, then wraps the whole emission in `Effect.catchCause`
so that even a failure to emit the failure result cannot displace the real
cause the run is failing on.

**All-or-nothing across files.** Every manifest a patch targets is read,
edited, and validated before anything lands; the first failure — a missing
targeted manifest (`ManifestNotFoundError`), an unknown `(marketplace,
name)` pair (`PluginNotFoundError`), or a failed validation
(`ManifestValidationError`) — stops the whole run, so a failed `result`
never reports a partial land across manifests.

## Convenience scalar outputs

Alongside `result`, `emit` writes eight plain scalar outputs so a caller
doesn't have to parse JSON for the common facts: `status`, `changed`
(`succeeded && !noop`), `mode`, `commit-sha`, `commit-url`, `pr-number`,
`pr-url`, `plugins-updated` (now the count of `(marketplace, name)` pairs
across every touched manifest) (`src/program.ts`; declared in
`action.yml`). Each of `commit-sha`/`commit-url`/`pr-url` falls back to
`""` and `pr-number` to `""` when the corresponding struct is `null`.
`commit-url` (and the `commit.url` it mirrors) is built by `land` from the
runner's own server URL (`GITHUB_SERVER_URL`, read through
`ActionEnvironment`) as `<server>/<owner>/<repo>/commit/<sha>`, so on GitHub
Enterprise Server it points at the enterprise host, not `github.com`
(`src/services/ManifestCommitter.ts`).

## Job summary

`emit` also writes a non-fatal markdown job summary via
`outputs.summary(buildSummary(output))`, guarded the same way as the
`result` write — a summary failure only logs a warning, it never fails the
run. `buildSummary` renders a property table (status, mode, plugins
updated, a "Manifests" row listing every touched file, dry run, and
commit/PR rows when present) plus a bullet list of touched plugins, each
annotated with its marketplace: `` `effected` (copilot) — sha, path ``
(`src/report.ts`).

## Default messages

When `commit-message`/`pr-title`/`pr-body` are unset, `src/report.ts`
generates them from the applied `ChangeRecord[]` across every touched
manifest, identifying each change by `(marketplace, name)`:

- `commitSubject` — three shapes. One `(marketplace, name)` pair:
  `ai(marketplace): repinned effected@spencerbeggs (copilot)`. One plugin
  name repinned across every marketplace the run touched, **and** every one
  of those manifests shares the same `name`, (the usual monorepo release,
  where "repinned 2 plugins" would hide that it is one plugin):
  `ai(marketplace): repinned effected@spencerbeggs (claude-code, copilot)`.
  Otherwise — including the same plugin `name` repinned in manifests whose
  own `name` field differs between marketplaces — `ai(marketplace): repinned
  N plugins`, N counting pairs (`src/report.ts`).
- `messageBody` — one bullet per changed field, per pair, prefixed with the
  marketplace: `- [copilot] pinned effected@spencerbeggs to <sha>`,
  `- [claude-code] changed path of effected@spencerbeggs to <path>`
  (`src/report.ts`).
- `defaultCommitMessage` — subject, blank line, body, blank line, and a DCO
  `Signed-off-by: <bot.name> <bot.email>` trailer. The DCO trailer is added
  to the **commit message text only** — it is never used to stamp
  author/committer/signature fields (`src/report.ts`).
