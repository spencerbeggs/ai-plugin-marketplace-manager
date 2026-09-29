---
type: Convention
status: stable
title: Validate the result before landing
description: Validate the edited manifest before any commit, fail with all reasons on any violation, and mint the branded change only through validateEdit.
stale_after: 2027-03-13T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-09-29T03:16:59Z
  body_sha256: 9b3742d64f265d8784e65a905ee5e077037870cc54897d53c996a35643f13160
tags:
  - validation
  - security
sources:
  - id: manifest-validator
    resource: ../../src/services/ManifestValidator.ts
  - id: program
    resource: ../../src/program.ts
  - id: marketplaces
    resource: ../../src/marketplaces.ts
  - id: manifest-validator-test
    resource: ../../__test__/services/ManifestValidator.test.ts
---

# Validate the result before landing

Validate the edited manifest — the RESULT of applying the patches, not the
patches themselves — before any commit is built.[^program] On any violation,
fail with `ManifestValidationError` carrying every reason found, not just the
first, and leave the manifest file untouched.[^manifest-validator]

Validation runs after the no-op guard and before the dry-run guard, in that
order: the no-op guard returns early on an unchanged edit
(inside `runOrchestration`'s per-marketplace loop), `validateEdit` runs next, and only then does
the dry-run check short-circuit landing.[^program] Placing validation ahead
of the dry-run guard is deliberate — it is what makes a dry run exercise the
full validation path rather than skip it.

At a call site, use `ManifestValidator.validateEdit`, never
`validateManifest` plus a raw string. `validateEdit` is the only thing that
mints the branded `ValidatedManifestChange` that `land` requires, so an
unvalidated or byte-stable string cannot reach the commit path — the
type checker enforces the ordering that would otherwise be a convention to
remember.[^manifest-validator]

Validation itself runs in two layers, in this order, against whichever
marketplace descriptor (`src/marketplaces.ts`'s `CLAUDE_CODE` or `COPILOT`)
the edit targeted:[^manifest-validator][^marketplaces]

1. **Structural** — parse with `@effected/jsonc`, then run that marketplace's
   own bundled schema through ajv: `src/schema/claude-code-marketplace.json`
   (the SchemaStore document) for `claude-code`, or the hand-authored
   `src/schema/copilot-marketplace.json` for `copilot`.
2. **Semantic**, scoped to the plugins this run actually touched, so an
   untouched entry already in the manifest is never retroactively rejected:
   - plugin names are unique across the whole manifest;
   - every patched name is still present after the edit;
   - for each touched plugin, the descriptor's own `sourceErrors` rule: a
     Claude Code entry's `source.source` must be `"git-subdir"`, its
     `source.url` an `https://github.com/<owner>/<repo>` URL (optionally
     with a `.git` suffix and a trailing slash), and its `source.path`
     non-empty; a Copilot entry's `source.source` must be `"github"` and its
     `source.repo` an `owner/name` string (`source.path`, when present, must
     be non-empty); both kinds require `source.sha` to be 40 lowercase hex
     characters.

The URL/repo rule carries a security consequence beyond correctness: without
it, a patch could re-point a Claude Code plugin's source at any origin the
runner can reach (not only GitHub), or a Copilot plugin at a source other
than a `github` repo — so it is the one semantic rule checked from several
directions in tests: for Claude Code, a foreign host, a `github.com`-lookalike
host, and a plain `http://` GitHub URL; for Copilot, a bare-string source, a
`url`-kind source, and a `repo` that isn't `owner/name`.[^manifest-validator-test]

[^program]: ../../src/program.ts:76-98
[^manifest-validator]: ../../src/services/ManifestValidator.ts:14-42,49-70
[^marketplaces]: ../../src/marketplaces.ts:44-81
[^manifest-validator-test]: `../../__test__/services/ManifestValidator.test.ts:78-91,184-206`

See [ajv strict:false](../decisions/ajv-strict-false.md) for why the
structural pass runs with `strict: false`, and
[Landing requires a validated, non-no-op change](../invariants/landing-requires-a-validated-non-noop-change.md)
for how the type system, not this ordering alone, enforces the invariant.
