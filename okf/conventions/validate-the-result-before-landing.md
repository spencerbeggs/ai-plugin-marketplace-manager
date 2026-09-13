---
type: Convention
title: Validate the result before landing
description: Validate the edited manifest before any commit, fail with all reasons on any violation, and mint the branded change only through validateEdit.
stale_after: 2027-03-13T00:00:00Z
generated:
  by: okfit/claude-code
tags:
  - validation
  - security
sources:
  - id: manifest-validator
    resource: ../../src/services/ManifestValidator.ts
  - id: program
    resource: ../../src/program.ts
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
(`runOrchestration` steps 1–4), `validateEdit` runs next, and only then does
the dry-run check short-circuit landing.[^program] Placing validation ahead
of the dry-run guard is deliberate — it is what makes a dry run exercise the
full validation path rather than skip it.

At a call site, use `ManifestValidator.validateEdit`, never
`validateManifest` plus a raw string. `validateEdit` is the only thing that
mints the branded `ValidatedManifestChange` that `land` requires, so an
unvalidated or byte-stable string cannot reach the commit path — the
type checker enforces the ordering that would otherwise be a convention to
remember.[^manifest-validator]

Validation itself runs in two layers, in this order:[^manifest-validator]

1. **Structural** — parse with `@effected/jsonc`, then run the bundled
   `src/schema/claude-code-marketplace.json` SchemaStore schema through ajv.
2. **Semantic**, scoped to the plugins this run actually touched, so an
   untouched entry already in the manifest is never retroactively rejected:
   - plugin names are unique across the whole manifest;
   - every patched name is still present after the edit;
   - for each touched plugin: `source.source === "git-subdir"`; `source.url`
     is an `https://github.com/<owner>/<repo>` URL, optionally with a `.git`
     suffix and a trailing slash; `source.path` is non-empty; `source.sha` is
     40 lowercase hex characters.

The URL rule carries a security consequence beyond correctness: without it, a
patch could re-point a plugin's source at any origin the runner can reach,
not only GitHub — so it is the one semantic rule checked from three
directions in tests: a foreign host, a `github.com`-lookalike host, and a
plain `http://` GitHub URL.[^manifest-validator-test]

[^program]: ../../src/program.ts:66-97
[^manifest-validator]: ../../src/services/ManifestValidator.ts:12-13,60-127
[^manifest-validator-test]: ../../**test**/services/ManifestValidator.test.ts:78-100

See [ajv strict:false](../decisions/ajv-strict-false.md) for why the
structural pass runs with `strict: false`, and
[Landing requires a validated, non-no-op change](../invariants/landing-requires-a-validated-non-noop-change.md)
for how the type system, not this ordering alone, enforces the invariant.
