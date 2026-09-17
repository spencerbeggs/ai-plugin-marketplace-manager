---
type: Convention
title: Re-pin Vendored Source on Dependency Bump
description: Bump effect or @effected/github-actions, then re-pin their vendored read-only source so an agent verifies against the installed version.
status: stable
stale_after: 2026-12-12T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: 926e08f01831f85f9455ddd4676ec30633da947c056a714b72a97883a747d0dc
tags:
  - deps
  - dx
---

# Re-pin Vendored Source on Dependency Bump

`effect` and `@effected/github-actions` are vendored as read-only reference
source under `.repos/`, pinned in `.repos/config.json`. When either package
bumps in this repository, re-pin its `.repos/config.json` `ref` to match —
an agent reading vendored source to verify an API against "what v4 actually
exports" is reading the wrong version otherwise. Use the `repos_manage`
silk tool (or `/silk:repos`) to re-pin, not raw `git`.

## Worked example: both pins re-synced

`.repos/config.json` pinned `effect` at `effect@4.0.0-rc.112` and `effected`
at `@effected/github-actions@0.11.0`, while `pnpm-lock.yaml` had already
moved to `effect@4.0.0-rc.115` (`pnpm-lock.yaml:1866`) and
`@effected/github-actions@0.13.0` (`pnpm-lock.yaml:485`). Both pins have
since been re-synced: `.repos/config.json` now reads `effect@4.0.0-rc.115`
(`.repos/config.json:5`) and `@effected/github-actions@0.13.0`
(`.repos/config.json:16`), matching the lockfile in both cases. This is the
rule in practice — check `.repos/config.json`'s `ref` fields against
`pnpm-lock.yaml`'s installed versions, and let the vendored checkout follow
the installed version, never the other way around.

## Review every flagged note on a re-pin

`repos_manage action:"pin"` reports `staleNoteIds` for the notes attached to
the entry being re-pinned. Each flagged note must be read and re-stamped
(its `date`/`ref` updated, and its claim re-verified against the new
checkout) rather than carried forward unread — a note is evidence tied to a
specific commit, and a re-pin moves that commit out from under it. The
`effected` entry's `n-0b69` note is the concrete case: it asserts a line
anchor, `packages/github/src/GitBranch.ts:46-69`, that
[pr-head-rerooted-in-one-ref-move](../decisions/pr-head-rerooted-in-one-ref-move.md)
cites by line number. The 0.11.0 → 0.13.0 re-pin flagged it as stale, and it
was re-verified at the new pin (`47683a5`) rather than assumed unchanged —
the range held, but that has to be re-checked each time, not presumed.
