---
type: Convention
title: Re-pin Vendored Source on Dependency Bump
description: Bump effect or @effected/github-actions, then re-pin their vendored read-only source so an agent verifies against the installed version.
status: stable
stale_after: 2026-12-12T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-09-29T03:06:02Z
  body_sha256: 32c7022a7474f361e340c297684db3c2ca3accfcdb90a6c3eaba51918da8583b
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

`.repos/config.json` pinned `effect` at `effect@4.0.0-rc.115` and `effected`
at `@effected/github-actions@0.13.0`, while `pnpm-lock.yaml` had already
moved to `effect@4.0.0-rc.118` (`pnpm-lock.yaml:2057`) and
`@effected/github-actions@0.19.0` (`pnpm-lock.yaml:643`). Both pins have
since been re-synced: `.repos/config.json` now reads `effect@4.0.0-rc.118`
(`.repos/config.json:5`) and `@effected/github-actions@0.19.0`
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
cites by line number. The 0.13.0 → 0.19.0 re-pin flagged it as stale, and it
was re-verified at the new pin (`9a8beda`) rather than assumed unchanged —
the range held, but that has to be re-checked each time, not presumed. The
same re-pin moved `GitHubError.ts`, whose footnoted anchors in
[branch-on-github-error-kind](branch-on-github-error-kind.md) had to be
re-pointed — a line anchor into vendored source is only as good as its pin.
