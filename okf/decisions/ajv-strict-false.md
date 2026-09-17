---
type: Decision
title: ajv runs with strict false against the bundled SchemaStore schema
description: "new Ajv({ strict: false, allErrors: true, logger: false }) validates third-party manifest DATA, not the schema itself; logger:false silences unknown-format warnings since ajv-formats is not shipped."
status: stable
tags:
  - validation
  - deps
sources:
  - id: validator
    resource: ../../src/services/ManifestValidator.ts
    title: "the Ajv construction and semantic re-validation of url"
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: 563e979fc2c5e9753a23c18865faab49bc7e8cd6c51fa02781d30101b143e8ae
verified:
  - by: human:spencer
    at: 2026-09-17T19:22:49Z
---

# ajv runs with strict false against the bundled SchemaStore schema

## Context

Structural validation of the edited manifest runs the vendored SchemaStore
`claude-code-marketplace.json` schema through ajv. That schema is written and
maintained upstream, as a draft-07 document, for linting third-party manifest
files in general — not authored against this action's own conventions.

## Decision

Construct ajv as `new Ajv({ strict: false, allErrors: true, logger: false })`
(`services/ManifestValidator.ts`)[^validator]:

- **`strict: false` is deliberate**, not a relaxed default left in place. This
  call validates third-party manifest **data** against a SchemaStore schema —
  it is not linting the schema document itself. ajv's strict mode can throw
  on keywords or formats the schema uses that strict mode does not recognize
  as safe, which would turn a schema-authoring choice made upstream into a
  hard failure in this action rather than a validation result.
- **`allErrors: true`** accumulates every structural violation in one pass
  rather than stopping at the first, matching the semantic layer's own
  accumulate-then-fail-once behavior.
- **`logger: false` silences ajv's "unknown format" warnings.** `ajv-formats`
  is not a dependency of this action, so the `uri` / `uri-reference` formats
  the SchemaStore schema references go unvalidated at the structural layer —
  ajv would otherwise log a warning per unrecognized format on every run.
  This is acceptable specifically because the semantic layer independently
  re-validates the one field this matters for: `url`, for every touched
  plugin, against `ManifestValidator`'s own GitHub-URL regex. The structural
  gap is covered by a check that exists anyway, not left open.

## Alternatives rejected

- **`strict: true`.** This was the original design intent recorded before
  the code was written, but the shipped implementation uses `strict: false`
  for the reasons above: strict mode risks throwing on the bundled schema's
  own keywords/formats when the goal is to validate data against that
  schema, not to lint the schema.
- **Shipping `ajv-formats`.** Rejected as an added dependency to close a gap
  the semantic layer already closes for the one format that carries a
  security consequence (`url`). Adding it would validate `uri`/`uri-reference`
  formats structurally, but would not remove the need for the semantic `url`
  check, since a syntactically valid URI is not the same as a URI pointing at
  an allowed GitHub origin.

## Consequences

- `uri` and `uri-reference` formats in the bundled schema go unvalidated at
  the structural (ajv) layer; anything depending on structural format
  validation there is not covered.
- The `url` field on every **touched** plugin is still fully validated,
  because the semantic layer checks it against a GitHub-URL pattern
  regardless of what the structural layer did or did not check.
- Adding `ajv-formats` later, if a future format-validation need arises
  beyond `url`, is additive — it would not require reversing `strict: false`
  or `logger: false`, which are independent of whether format keywords are
  registered.

[^validator]: `services/ManifestValidator.ts` — `new Ajv({ strict: false, allErrors: true, logger: false })`
