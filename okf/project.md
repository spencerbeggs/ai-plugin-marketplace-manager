---
type: Project
title: claude-code-marketplace-manager
description: What this project is, its boundaries, and its non-goals.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: 9506b161d61c3568445db51f19aebcb02e567b73a334762194eaee33952dce88
---

# claude-code-marketplace-manager

## Purpose

`claude-code-marketplace-manager` is a GitHub Action that edits a Claude Code
plugin marketplace manifest (`.claude-plugin/marketplace.json`) in place. It
applies partial-merge updates to existing `git-subdir` plugin entries (any
subset of `url` / `path` / `sha`), validates the result (structural and
semantic), and lands the change as a server-signed, verified commit — either
directly on the base branch (`mode: commit`) or via a pull request
(`mode: pr`). See [action.yml](../action.yml) for the full input/output
contract.

## Stack

Built on Effect v4, `@effected/github-actions` (the runner) and
`@effected/github` (the API), with `@effected/jsonc` for format-preserving
manifest edits and `ajv` for manifest validation. Bundled into a committed
`dist/` by `@savvy-web/github-action-builder`. Versions are pinned through
pnpm catalogs, not hardcoded here — read the installed version from the
lockfile; at the time this was written that was `effect@4.0.0-rc.115`
(`pnpm-lock.yaml:1866`), which is newer than any version quoted in prose
elsewhere in this repository's history.

## What it replaced

This action replaces a hand-written workflow plus a bash script
(`repin-plugins.sh`) that had two defects: a git-CLI push authenticated with a
GitHub App token is not GPG-verified, so "require signed commits" branch
protection rejected it (see [verified-commit](glossary/verified-commit.md));
and auto-resolving each plugin's "latest release" could move a plugin onto an
untested commit and re-pin unchanged plugins, forcing Claude Code to
re-download them. This action applies only explicit values and produces
server-signed, verified commits instead.

## Boundaries

This repository owns the action's `src/` implementation, its committed
`dist/` bundle, its input/output JSON Schemas at the repository root, and the
`.claude-plugin/marketplace.json` editing/validation/landing logic. It does
not own the workflows that invoke it — those live in consumer repositories
(see [consumers](consumers/index.md)) and decide when to call the action, with
which inputs, and in which mode.

### In scope (v1)

- Editing existing `git-subdir` plugin entries.
- Both the manual (`name`/`url`/`path`/`sha`) and `json` input paths.
- Partial-merge field updates, matched by plugin name.
- Result validation (structural + semantic) before any commit.
- Landing directly on the base branch (`commit` mode) or via a pull request
  (`pr` mode), with server-signed, verified commits.
- Structured JSON `result` output plus a markdown job summary.

## Non-goals

- **No release lookup or ref→sha resolution.** Inputs are explicit values
  only; the action never resolves a plugin's "latest release" to a commit
  SHA on its own.
- **No adding plugins or non-`git-subdir` sources.** A patch names an
  existing plugin; an unknown name is an error
  (`src/errors/errors.ts:14`, `src/services/ManifestEditor.ts:80-82`).
- **No editing manifest metadata, `owner`, or other top-level fields.** Only
  `plugins[].source` fields (`url`/`path`/`sha`) are ever written
  (`src/services/ManifestEditor.ts:40`).
