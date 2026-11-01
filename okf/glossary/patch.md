---
type: Glossary
title: patch
description: What "patch" (or "plugin patch") means in this repository's input model, and what it is not.
status: stable
generated:
  by: okfit/claude-code
  at: 2026-09-23T21:08:46Z
tags: [validation]
integrity:
  generated:
    body: 835eb74417681802
---

# patch

In this repository, a "patch" (also "plugin patch", `PluginPatch`,
`src/schema/input.ts`) is an object `{ name, marketplace, sha, path? }`
that identifies one existing entry in one marketplace's manifest `plugins[]`
array by `name` and changes only the fields it provides — there is no manual
`url` input, and no `url` field of any kind on the patch shape.
`applyPatches` (`src/services/ManifestEditor.ts`) matches the patch to a
plugin by `name` (failing with `PluginNotFoundError` when no plugin has that
name), then for each of `path`/`sha` present on the patch, writes the new
value only if it differs from the current one — every field the patch
omits, and every field whose value is unchanged, is left byte-for-byte
untouched in the manifest text via `@effected/jsonc`'s format-preserving
edit.

The `json` input wraps zero or more patches in an object envelope,
`{ plugins: PluginPatch[] }` (`src/schema/input.ts`'s `JsonInput`), rather
than a bare array — chosen so the top-level shape is usable as-is by
tool-calling and structured-output validators that require an object root.
The manual input path (`name`/`marketplace`/`sha`/`path` as separate action
inputs) decodes through this same schema (`src/inputs.ts`) into a
single-element patch, so both input paths get identical validation and error
shape.

## Not the same as two other things

- **Not an RFC 7386 JSON Merge Patch.** A JSON Merge Patch describes how to
  transform an entire JSON document, recursively, with `null` meaning
  "delete this key". A `PluginPatch` only ever touches one named plugin's
  two known `source` fields (`path`/`sha`) in the one marketplace manifest
  it names, has no delete semantics, and is matched by a `name` field rather
  than by document structure.
- **Not a git patch/diff.** It carries no line-level hunks; it is a small
  structured object naming which scalar fields to set to which values.
