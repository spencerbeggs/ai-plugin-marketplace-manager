---
type: Glossary
title: patch
description: What "patch" (or "plugin patch") means in this repository's input model, and what it is not.
status: stable
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: ac0e70091595189d24d4f6ac4f79e5deee6ebe0692fbc6b37b73a10862fb2a81
tags: [validation]
---

# patch

In this repository, a "patch" (also "plugin patch", `PluginPatch`,
`src/schema/input.ts:15-21`) is an object `{ name, url?, path?, sha? }`
that identifies one existing entry in `marketplace.json`'s `plugins[]` array
by `name` and changes only the fields it provides. `applyPatches`
(`src/services/ManifestEditor.ts:55-105`) matches the patch to a plugin by
`name` (`:79-82`, failing with `PluginNotFoundError` when no plugin has that
name), then for each of `url`/`path`/`sha` present on the patch, writes the
new value only if it differs from the current one (`:83-90`) — every field
the patch omits, and every field whose value is unchanged, is left
byte-for-byte untouched in the manifest text via `@effected/jsonc`'s
format-preserving edit.

The `json` input wraps zero or more patches in an object envelope,
`{ plugins: PluginPatch[] }` (`src/schema/input.ts:29-33`), rather than a
bare array — chosen so the top-level shape is usable as-is by tool-calling
and structured-output validators that require an object root. The manual
input path (`name`/`url`/`path`/`sha` as separate action inputs) decodes
through this same schema (`src/inputs.ts:92-108`) into a single-element
patch, so both input paths get identical validation and error shape.

## Not the same as two other things

- **Not an RFC 7386 JSON Merge Patch.** A JSON Merge Patch describes how to
  transform an entire JSON document, recursively, with `null` meaning
  "delete this key". A `PluginPatch` only ever touches one named plugin's
  three known `source` fields, has no delete semantics, and is matched by a
  `name` field rather than by document structure.
- **Not a git patch/diff.** It carries no line-level hunks; it is a small
  structured object naming which scalar fields to set to which values.
