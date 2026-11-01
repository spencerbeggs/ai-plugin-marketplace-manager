---
type: Decision
title: url input and in-band schemaVersion dropped
description: v2 removes the url input/patch field entirely (only sha and path can be repinned) and removes ReportOutput's in-band schemaVersion field, leaving the schema version expressed only in the $schema URL's schemas/<version>/ path.
status: stable
tags:
  - architecture
  - compat
sources:
  - id: input-schema
    resource: ../../src/schema/input.ts
    title: "PluginPatch with no url field; SCHEMA_VERSION removed from report-output.ts"
  - id: inputs
    resource: ../../src/inputs.ts
    title: "rejectLegacyUrl rejects a v1 payload's url key by name"
  - id: design-spec
    resource: ../../docs/superpowers/specs/2026-09-23-v2-multi-marketplace-design.md
    title: "§1 Patch inputs and §3 result 2.0"
generated:
  by: okfit/claude-code
  at: 2026-09-23T21:08:46Z
verified:
  - by: human:spencer
    at: 2026-11-01T19:17:03Z
integrity:
  generated:
    body: 301b46944f1bb875
  verified:
    by: human:spencer
    at: 2026-11-01T19:17:03Z
    content: 29fd0f37af1abde5
---

# `url` input and in-band `schemaVersion` dropped

## Context

v1's patch shape carried three optional repinnable fields —
`url`/`path`/`sha` — and `ReportOutput` carried an in-band `schemaVersion`
literal alongside the `$schema` URL, which already encoded the same
version in its `schemas/<version>/` path segment. v2 adds a `marketplace`
field to every patch and needs the manual/`json` decode paths and the
`result` shape to stay simple as a second marketplace kind (with its own
`source` shape) is introduced.

## Decision

Two independent drops, both v2 contract breaks:

1. **`url` is removed from the patch shape and the manual-path inputs.**
   `PluginPatch` (`src/schema/input.ts`) has no `url` field; the manual
   path has no `url` action input at all. A typical v1 `json` entry —
   `{ name, sha }`, with no `url` at all — now fails through the ordinary
   generic decode, which names the missing `marketplace` field; that path
   needed no special handling. The less common v1 senders that did pass
   `url` on an entry are the ones `rejectLegacyUrl` (`src/inputs.ts`)
   exists for: it rejects that entry by name, naming `url` specifically,
   before the generic schema decode runs and could otherwise report a
   more confusing "missing marketplace" error on a payload whose real
   problem is a field that no longer exists at all.
   `decodeJsonInput`'s `onExcessProperty: "error"` would reject a lingering
   `url` anyway if `rejectLegacyUrl` were ever bypassed. Only `sha` (now
   required on every patch, manual or `json`) and `path` (still optional)
   can be repinned.
2. **`ReportOutput.schemaVersion` is removed.** The version a payload's
   shape corresponds to is expressed exactly once, in the `$schema` URL's
   `schemas/<version>/` path segment (`SCHEMA_URL`,
   `OutputSchemaIdentity.$id`) — never duplicated as a second, in-band
   field that could drift from it.

## Alternatives rejected

- **Keep `url` and add a `github`-source equivalent for Copilot.** Rejected:
  Copilot pins by `sha` and optionally `path` against a fixed `repo`, not
  by resolving a source URL, and Claude Code's `url` was never meant to be
  repinned in the steady state — a plugin's source repository does not
  move. Carrying a field that both marketplaces' real usage leaves unset is
  surface with no observed need.
- **Keep `schemaVersion` for a redundant machine-readable version check
  independent of parsing the URL.** Rejected: `SCHEMA_URL` already is the
  full, resolvable identity of the shape a payload was written against;
  a consumer that needs the version number alone can extract it from the
  URL's path segment, and a field that merely restates part of another
  field's value is exactly the kind of duplication
  [versioned-schema-documents](versioned-schema-documents.md) was written
  to avoid at the document level.

## Consequences

- A typical v1 sender's `json` payload — `{ name, sha }`, no `url` — fails
  cleanly through the ordinary decode, which names the missing
  `marketplace` field, rather than being partially applied. The less common
  v1 sender that did pass `url` on an entry instead fails with
  `rejectLegacyUrl`'s message naming the exact index and the `url` field —
  see [action-inputs](../interfaces/action-inputs.md).
- `groupPlugins`'s `ChangedPlugin.fields` type narrows from
  `"url" | "path" | "sha"` to `"path" | "sha"`; a `result` payload can never
  report a `url` field change again, for either marketplace.
- Any consumer parsing v1's `result.schemaVersion` field directly (rather
  than reading `$schema`) breaks on the v2 output; the migration note in
  the README calls this out explicitly.
