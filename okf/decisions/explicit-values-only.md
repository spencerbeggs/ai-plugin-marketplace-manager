---
type: Decision
title: Explicit values only, no release lookup
description: The action applies only the url/path/sha values a caller supplies; it never resolves a release, a ref, or a "latest" sentinel to a commit SHA on its own.
status: draft
tags:
  - architecture
sources:
  - id: schema
    resource: ../../src/schema/input.ts
    title: PluginPatch — url/path/sha are the only patchable fields
  - id: errors
    resource: ../../src/errors/errors.ts
    title: PluginNotFoundError — an unknown plugin name is an error, not a create
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: 272e4167bc441d2a4161362d9594ed15df30c18085c81b8cf7c99ff40f1f3e4c
---

# Explicit values only, no release lookup

## Context

This action replaces a hand-written bash script (`repin-plugins.sh`) that
auto-resolved each plugin's "latest release" to a commit before re-pinning
it. That auto-resolution had two concrete failure modes: it could move a
plugin onto a commit nobody had tested, silently changing behavior with no
review step in between; and it re-pinned plugins whose source had not
actually changed, because "latest release" moved even when the plugin itself
was unchanged, forcing Claude Code to re-download an artifact that was
already correct.

## Decision

Apply only the explicit `url` / `path` / `sha` values a caller supplies in a
patch (`PluginPatch`, `schema/input.ts`)[^schema]. The action performs no
release lookup and no ref→sha resolution of any kind: there is no "latest"
sentinel value, and nothing in the input schema or the editor accepts one. A
patch names an existing plugin by `name` and changes only the fields present
on the patch; a name the manifest does not already contain fails with
`PluginNotFoundError` rather than being treated as an add[^errors]. Precision
is the design goal — a run either changes exactly the fields a caller named
to exactly the values a caller supplied, or it fails.

## Alternatives rejected

- **The pre-existing bash script's auto-resolve of each plugin's "latest
  release".** Rejected as the behavior this action exists to replace: it
  moved plugins onto untested commits with no human review of the resulting
  SHA, and it re-pinned plugins whose source had not changed, forcing
  unnecessary re-downloads for consumers of the marketplace.
- **Accepting a "latest" or similar sentinel value in a patch's `sha` field.**
  Never implemented. It would reintroduce the same untested-commit and
  gratuitous-re-pin failure modes under a different spelling, inside the
  action itself rather than in an external script.

## Consequences

- A caller who wants to move a plugin to a new release must resolve the
  target SHA themselves and pass it explicitly; the action will not do that
  resolution for them.
- Because there is no lookup step, a run's behavior is fully determined by
  its inputs — there is nothing external (a release feed, a tag) whose state
  at run time can change the outcome.
- Adding a plugin, or pointing a patch at a non-`git-subdir` source, is out
  of scope for the same reason: those are the boundary this decision draws,
  not merely unimplemented features.

[^schema]: `schema/input.ts` — `PluginPatch`
[^errors]: `errors/errors.ts:14` — `PluginNotFoundError`
