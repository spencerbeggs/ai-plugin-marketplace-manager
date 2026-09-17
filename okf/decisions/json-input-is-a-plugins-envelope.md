---
type: Decision
title: The json input is a plugins envelope, not a bare array
description: JsonInput is Schema.Struct({ plugins Schema.Array(PluginPatch) }), an object root mirroring marketplace.json's own top-level plugins key.
status: stable
tags:
  - architecture
  - dx
sources:
  - id: schema
    resource: ../../src/schema/input.ts
    title: "JsonInput — an object envelope, not a bare array"
  - id: inputs
    resource: ../../src/inputs.ts
    title: decode failure raises InvalidInputError
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: 48fa88752bdf52b80446fd8ba7db08b95ef2754fbcd67f3cca23ebb8f6f7c100
verified:
  - by: human:spencer
    at: 2026-09-17T19:22:49Z
---

# The json input is a plugins envelope, not a bare array

## Context

The action's `json` input path lets a caller supply a batch of per-plugin
partial-merge patches in one payload instead of the single-plugin manual
path (`name`/`url`/`path`/`sha`). The original shape for this payload was a
bare array of patches. That shape had to change.

## Decision

`JsonInput` is `Schema.Struct({ plugins: Schema.Array(PluginPatch) })`[^schema]
— an object with a `plugins` key, not a bare array at the schema root. Each
entry is a `PluginPatch`: it names an existing plugin and carries only the
fields (`url`/`path`/`sha`) it changes; every other field on that plugin's
entry in the manifest is left byte-stable. This partial-merge shape, keyed by
`name`, was chosen over two alternatives evaluated for the same role:
full-manifest replacement, which would drop metadata and other plugins not
named in the payload, and an RFC 7386 JSON Merge Patch, whose array semantics
are opaque (a merge-patch array replaces wholesale rather than patching
per-element) and harder to validate against a schema.

The object-root shape specifically was chosen for two reasons: it is usable
as-is by tool-calling / structured-output validators that require an object
at the schema root (a bare-array root is not universally accepted by such
tooling), and the `plugins` key mirrors `marketplace.json`'s own top-level
`plugins` array, which leaves room to add sibling keys later — for example a
future manifest-level option — without another shape-breaking change to the
input contract.

## Alternatives rejected

- **A bare array of patches at the schema root.** This was the original
  shape and is no longer accepted: a bare-array `json` payload now fails
  decode with `InvalidInputError`[^inputs]. Rejected because an object root
  is what the tool-calling / structured-output ecosystem's schema validators
  expect, and because a bare array leaves no room to add a sibling key later
  without breaking every existing caller's payload shape.
- **Full-manifest replacement** (accepting and writing back an entire
  `marketplace.json`). Rejected because it drops metadata and any plugin
  entries not named in the payload — a caller supplying a partial manifest by
  omission would silently delete data.
- **RFC 7386 JSON Merge Patch semantics.** Rejected because its array
  semantics are opaque for this shape — a merge-patch array replaces the
  target array wholesale rather than patching individual named entries — and
  because that opacity makes the payload harder to validate against a
  schema than a keyed, per-entry patch list.

## Consequences

- A bare-array `json` payload — the pre-decision shape — now fails decode
  with `InvalidInputError` before any work happens; there is no silent
  fallback that interprets it as anything else.
- Adding a sibling key alongside `plugins` (for a future manifest-level
  option) does not require another shape-breaking change to the input
  contract, because the object root already has room for it.
- The generated JSON Schema for this input has an object at its root, which
  keeps it usable by structured-output / tool-calling validators that
  require one.

[^schema]: `schema/input.ts` — `JsonInput`
[^inputs]: `inputs.ts:73-76` — `decodeJsonInput` failure raises `InvalidInputError`
