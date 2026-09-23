---
type: Decision
title: Repository renamed at v2; frozen 1.0 schema $ids rewritten, not dropped
description: The repository is renamed claude-code-marketplace-manager to ai-plugin-marketplace-manager at v2; rather than dropping 1.0 from OUTPUT_SCHEMA_VERSIONS, the frozen schemas/1.0/{input,output}.json files have their $id hand-rewritten to the new repo name once, at the rename, keeping 1.0 tracked and drift-checked.
status: draft
tags:
  - compat
  - release
sources:
  - id: input-schema
    resource: ../../src/schema/input.ts
    title: "OUTPUT_SCHEMA_VERSIONS = [\"1.0\", OUTPUT_SCHEMA_VERSION] and the repo name in hosted()"
  - id: versioned-schema-documents
    resource: ../decisions/versioned-schema-documents.md
    title: "the per-label frozen-file mechanism this decision extends across a rename"
  - id: design-spec
    resource: ../../docs/superpowers/specs/2026-09-23-v2-multi-marketplace-design.md
    title: "Identity and §4 Schema hosting across the rename"
  - id: maintainer
    resource: conversation with the repository owner
    author: human:spencer
    last_modified: 2026-09-23T00:00:00Z
    title: "chose rewriting the frozen 1.0 $ids over dropping 1.0 from the tracked list"
generated:
  by: okfit/claude-code
  at: 2026-09-23T21:55:46Z
  body_sha256: 3b3df6a57d2e8e20b185e220d284484f8a42941aaa8d459546061364a1f13ffa
---

# Repository renamed at v2; frozen 1.0 schema $ids rewritten, not dropped

## Context

v2 adds a second marketplace, and the maintainer chose to rename the
repository from `spencerbeggs/claude-code-marketplace-manager` to
`spencerbeggs/ai-plugin-marketplace-manager` to match, since the action no
longer edits only a Claude Code manifest.
[versioned-schema-documents](versioned-schema-documents.md) already commits
this repository to a frozen-file-per-label scheme: `OUTPUT_SCHEMA_VERSIONS`
tracks every label the CLI still verifies, and each hosted `$id` is derived
from the identity's `repo` field via `HostedSchema.github`.

That derivation is the problem a rename creates. `schemas/1.0/output.json`
and `schemas/1.0/input.json` were already committed with `$id`s baked in
under the *old* repository name. If `OUTPUT_SCHEMA_VERSIONS` kept `"1.0"`
unchanged after the rename, the CLI would derive the `1.0` label's expected
`$id` from the *new* name (`ai-plugin-marketplace-manager`) and compare it
against files that still declared the old one — `pnpm schema:check` would
report drift on a label nobody intends to regenerate.

## Decision

Three parts:

1. **The repository is renamed** to `spencerbeggs/ai-plugin-marketplace-manager`
   as part of the v2 release; `action.yml`'s `name:` becomes "AI Plugin
   Marketplace Manager"; `hosted()` in `src/schema/input.ts` points at the
   new repo name.
2. **The frozen `schemas/1.0/input.json` and `schemas/1.0/output.json`
   files have line 3's `$id` hand-rewritten, once, to the new repo name**
   (`https://raw.githubusercontent.com/spencerbeggs/ai-plugin-marketplace-manager/main/schemas/1.0/{input,output}.json`)
   — the only change to either file. `OUTPUT_SCHEMA_VERSIONS` stays
   `["1.0", OUTPUT_SCHEMA_VERSION]`: `1.0` remains tracked and
   drift-checked, `pnpm schema:check` passes, and it reports `1.0` as
   `(frozen: 1.0)` rather than skipping it.
3. **`schemas/1.0/output.json` line 69's `$schema` enum value deliberately
   still names the old repo URL**
   (`https://raw.githubusercontent.com/spencerbeggs/claude-code-marketplace-manager/main/schemas/1.0/output.json`):
   this is the value a v1 action payload's `$schema` field actually
   carries — v1 code emitted it before the rename existed and nothing
   re-emits old payloads — and GitHub's rename redirect resolves that URL
   to the current repository's content, so the value stays historically
   accurate rather than describing a URL v1 never produced. Rewriting it to
   the new repo name would make the frozen document lie about what v1
   payloads actually say.

The reviewer probed the general redirect mechanism against an independent,
already-renamed repository: `curl -I
https://raw.githubusercontent.com/zeit/next.js/canary/package.json` returns
`200` after the `zeit` → `vercel` owner rename, confirming
`raw.githubusercontent.com` does honor a repository/owner rename redirect.
This repository's own URLs were checked directly on 2026-09-23, after the
rename and the push of `5993b81`. `curl -sL` against the old-name URL
`https://raw.githubusercontent.com/spencerbeggs/claude-code-marketplace-manager/main/schemas/1.0/output.json`
returned `200`, serving the 1.0 document with its rewritten `$id`. The
new-name `schemas/1.0/output.json` and `schemas/2.0/output.json` URLs also
returned `200`. The redirect holds, so the stub-repository fallback below is
not needed.

## Alternatives rejected

- **Drop `"1.0"` from `OUTPUT_SCHEMA_VERSIONS` entirely, leaving
  `schemas/1.0/` committed byte-for-byte under its old `$id`.** This was
  briefly implemented on this branch and then reverted. It reads as the
  safer choice — nothing about the frozen files changes — but it silently
  drops `1.0` from drift-checking: nothing in `pnpm schema:build` /
  `pnpm schema:check` ever looks at `schemas/1.0/` again, so a future
  accidental edit to those files, or a divergence between the committed
  `$id` and what the files actually need to say, has no CI signal at all.
  Rewriting the `$id` once and keeping `1.0` tracked costs one hand-edit
  per file and buys back that check permanently.
- **Rewrite `schemas/1.0/`'s `$id`s to the new repository name while also
  rewriting the `$schema` enum to match.** Rejected: a payload emitted
  under v1 carries a `$schema` pointing at the *old* URL, not the new one,
  and rewriting that enum value would make the frozen document assert a
  URL no v1 payload ever emitted — diverging the committed content from
  what was actually shipped, in the one field that is supposed to describe
  it.
- **Stand up a stub `claude-code-marketplace-manager` repository** serving
  only `schemas/1.0/`, bypassing reliance on the rename redirect entirely.
  Held in reserve as the fallback in case the redirect failed. The
  post-rename check above showed it works, so the stub is not needed.

## Consequences

- `schemas/1.0/` stays inside `OUTPUT_SCHEMA_VERSIONS` and inside
  `pnpm schema:build` / `pnpm schema:check`'s pre-flight: the CLI checks
  the file exists and declares exactly its derived `$id`, but never
  regenerates its content. `pnpm schema:check` reports it `(frozen: 1.0)`
  and exits `0`.
- The `$id` rewrite at line 3 is the one edit a frozen file ever takes, and
  it happens exactly once, at the rename — not on every subsequent schema
  change.
- `schemas/1.0/output.json` line 69's `$schema` enum keeps naming the old
  repository on purpose; a future reviewer who "fixes" it to match the new
  `$id` would be reintroducing the exact mismatch this decision avoids.
- Every URL a v1 payload's `$schema` field carries depends on GitHub's
  repository-rename redirect continuing to serve `raw.githubusercontent.com`
  requests against the old owner/repo pair. The post-rename check confirmed
  the redirect works today. It remains an external dependency GitHub could
  change; if it ever stops resolving, the fallback is the stub repository.
  This Decision stays `status: draft` until a human verifies it.
- A future contract change at `2.0` proceeds exactly as
  [bump-the-output-schema-version](../runbooks/bump-the-output-schema-version.md)
  describes, appending a new label to `OUTPUT_SCHEMA_VERSIONS` while `1.0`
  stays frozen and tracked alongside it.
