---
type: Project
title: ai-plugin-marketplace-manager
description: What this project is, its boundaries, and its non-goals.
status: stable
generated:
  by: okfit/claude-code
  at: 2026-09-23T20:44:15Z
integrity:
  generated:
    body: 1a2d7a7e2a951423
---

# ai-plugin-marketplace-manager

## Purpose

`ai-plugin-marketplace-manager` (renamed from
`claude-code-marketplace-manager` at v2) is a GitHub Action that edits, in
place, either or both of two fixed-path marketplace manifests — the Claude
Code manifest (`.claude-plugin/marketplace.json`, `git-subdir` entries) and
the GitHub Copilot manifest (`.github/plugin/marketplace.json`, `github`
entries) — from one dispatch. It partial-merge updates existing entries
named per `(marketplace, name)` pair, setting `sha` (and optionally `path`),
validates every touched manifest (structural + semantic) before anything is
committed, and lands all touched manifests as a single server-signed,
verified commit — either directly on the base branch (`mode: commit`) or via
a pull request (`mode: pr`). See [action.yml](../action.yml) for the full
input/output contract.

## Stack

Built on Effect v4, `@effected/github-actions` (the runner) and
`@effected/github` (the API), with `@effected/jsonc` for format-preserving
manifest edits and `ajv` for manifest validation. Bundled into a committed
`dist/` by `@savvy-web/github-action-builder`. Versions are pinned through
pnpm catalogs, not hardcoded here — read the installed version from the
lockfile.

## What it replaced

v1 replaced a hand-written workflow plus a bash script (`repin-plugins.sh`)
that had two defects: a git-CLI push authenticated with a GitHub App token
is not GPG-verified, so "require signed commits" branch protection rejected
it (see [verified-commit](glossary/verified-commit.md)); and auto-resolving
each plugin's "latest release" could move a plugin onto an untested commit
and re-pin unchanged plugins, forcing Claude Code to re-download them. v1
applied only explicit values and produced server-signed, verified commits
instead. v2 extends the same guarantee to a second marketplace and lands
every touched manifest in the same commit or PR, so a plugin shipping to
both marketplaces no longer needs two separate signed commits.

## Boundaries

This repository owns the action's `src/` implementation, its committed
`dist/` bundle, its versioned input/output JSON Schemas under `schemas/`,
and the editing/validation/landing logic for both fixed-path manifests. It
does not own the workflows that invoke it — those live in consumer
repositories (see [consumers](consumers/index.md)) and decide when to call
the action, with which inputs, and in which mode.

### In scope (v2)

- Editing existing entries in either or both of two fixed-path manifests:
  `.claude-plugin/marketplace.json` (Claude Code, `git-subdir` sources) and
  `.github/plugin/marketplace.json` (Copilot, `github` sources).
- Both the manual (`name`/`marketplace`/`sha`/`path`) and `json` input
  paths, one patch schema shared by both.
- Partial-merge field updates — `sha` and optionally `path` — matched by
  `(marketplace, name)` pair; a field absent from an entry's `source` is
  inserted, not just replaced.
- All-or-nothing validation: every targeted manifest is read, edited, and
  structurally + semantically validated before anything commits; the first
  failure stops the whole run.
- Landing every touched manifest in **one** commit or one PR head move —
  directly on the base branch (`commit` mode) or via a pull request (`pr`
  mode) — with server-signed, verified commits.
- Structured JSON `result` output (grouped by `(marketplace, name)`, listing
  every touched manifest) plus a markdown job summary.

## Non-goals

- **No release lookup or ref→sha resolution.** Inputs are explicit values
  only; the action never resolves a plugin's "latest release" to a commit
  SHA on its own.
- **No adding or removing plugin entries, and no editing manifest metadata
  or `owner`.** A patch names an existing entry in one manifest; an unknown
  `(marketplace, name)` pair is an error
  (`src/errors/errors.ts`, `src/services/ManifestEditor.ts`). Only
  `source.sha`/`source.path` are ever written.
- **No configurable manifest paths and no discovery.** `claude-code` and
  `copilot` each map to exactly one fixed path
  (`.claude-plugin/marketplace.json`, `.github/plugin/marketplace.json`);
  there is no `path`-per-marketplace input and no search across candidate
  locations. See
  [fixed-manifest-paths-per-marketplace](decisions/fixed-manifest-paths-per-marketplace.md).
- **No Copilot `url` or bare-string sources, and no Claude `github`
  sources.** Each marketplace pins only its own documented source kind; a
  Copilot entry whose `source` is a plain string, or either marketplace's
  entry using the other's source shape, fails validation rather than being
  silently skipped.
- **No `url` repinning on either path**, and **no in-band `schemaVersion`**
  in the `result` output. See
  [url-and-schema-version-dropped](decisions/url-and-schema-version-dropped.md).
