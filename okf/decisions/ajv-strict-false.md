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
    title: "the Ajv construction and semantic re-validation, per marketplace"
  - id: marketplaces
    resource: ../../src/marketplaces.ts
    title: "the two bundled schemas and each descriptor's sourceErrors"
generated:
  by: okfit/claude-code
  at: 2026-09-23T21:08:46Z
verified:
  - by: human:spencer
    at: 2026-09-17T19:22:49Z
  - by: human:spencer
    at: 2026-11-01T19:17:03Z
integrity:
  generated:
    body: 33524b3ed0618fd0
  verified:
    by: human:spencer
    at: 2026-11-01T19:17:03Z
    content: 9446db26880e6519
---

# ajv runs with strict false against the bundled SchemaStore schema

## Context

Structural validation of an edited manifest runs one of two draft-07 JSON
Schema documents through ajv, chosen by which marketplace the edit targeted:
the vendored SchemaStore `claude-code-marketplace.json` for Claude Code, or
the hand-authored `src/schema/copilot-marketplace.json` for Copilot (GitHub
publishes no JSON Schema for its own manifest, so this one is maintained in
this repository). Neither schema is authored against this action's own
conventions specifically — the SchemaStore one is written and maintained
upstream for linting third-party manifest files in general, and the Copilot
one is deliberately permissive about everything beyond the documented
required fields.

## Decision

Construct ajv as `new Ajv({ strict: false, allErrors: true, logger: false })`
(`services/ManifestValidator.ts`)[^validator]:

- **`strict: false` is deliberate**, not a relaxed default left in place. This
  call validates third-party manifest **data** against a marketplace's own
  schema — it is not linting the schema documents themselves. ajv's strict
  mode can throw on keywords or formats a schema uses that strict mode does
  not recognize as safe, which would turn a schema-authoring choice (made
  upstream for the SchemaStore document, or in this repository for the
  Copilot one) into a hard failure in this action rather than a validation
  result.
- **`allErrors: true`** accumulates every structural violation in one pass
  rather than stopping at the first, matching the semantic layer's own
  accumulate-then-fail-once behavior.
- **`logger: false` silences ajv's "unknown format" warnings.** `ajv-formats`
  is not a dependency of this action, so the `uri` / `uri-reference` formats
  the SchemaStore schema references go unvalidated at the structural layer —
  ajv would otherwise log a warning per unrecognized format on every run.
  This is acceptable specifically because the semantic layer independently
  re-validates the fields that carry the security consequence: a touched
  Claude Code entry's `source.url` must be a GitHub URL, and a touched
  Copilot entry's `source.source` must be `"github"` with a `source.repo` of
  the form `owner/name` (`ManifestValidator`'s per-marketplace
  `sourceErrors`). The structural gap is covered by checks that exist
  anyway, not left open.

## Alternatives rejected

- **`strict: true`.** This was the original design intent recorded before
  the code was written, but the shipped implementation uses `strict: false`
  for the reasons above: strict mode risks throwing on either bundled
  schema's own keywords/formats when the goal is to validate data against
  that schema, not to lint the schema.
- **Shipping `ajv-formats`.** Rejected as an added dependency to close a gap
  the semantic layer already closes for the fields that carry a security
  consequence (a Claude Code entry's GitHub `url`; a Copilot entry's
  `github`-sourced, `owner/name` `repo`). Adding it would validate
  `uri`/`uri-reference` formats structurally, but would not remove the need
  for the semantic checks, since a syntactically valid URI or repo string is
  not the same as one pointing at an allowed GitHub origin.

## Consequences

- `uri` and `uri-reference` formats in the bundled SchemaStore schema go
  unvalidated at the structural (ajv) layer; anything depending on
  structural format validation there is not covered.
- The security-relevant fields on every **touched** plugin are still fully
  validated regardless of marketplace, because the semantic layer checks
  them (a GitHub-URL pattern for Claude Code, a `"github"` source with an
  `owner/name` repo for Copilot) regardless of what the structural layer did
  or did not check.
- Adding `ajv-formats` later, if a future format-validation need arises
  beyond these fields, is additive — it would not require reversing
  `strict: false` or `logger: false`, which are independent of whether
  format keywords are registered.

[^validator]: `services/ManifestValidator.ts` — `new Ajv({ strict: false, allErrors: true, logger: false })`
