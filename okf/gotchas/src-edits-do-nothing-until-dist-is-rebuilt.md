---
title: src edits do nothing until dist is rebuilt
description: The action runs the committed dist/ bundle; editing and committing src/ alone ships no behavior change.
type: Gotcha
resource: ../../dist
stale_after: 2027-03-13T00:00:00Z
tags: [ci, dx]
generated:
  by: okfit/claude-code
sources:
  - id: action-yml
    resource: ../../action.yml
    last_modified: 2026-09-13T00:00:00Z
  - id: package-json
    resource: ../../package.json
    last_modified: 2026-09-13T00:00:00Z
---

# src edits do nothing until dist is rebuilt

## What a reader sees

`action.yml`'s `runs:` block points every phase at a committed, bundled file —
`pre: dist/pre.js`, `main: dist/main.js`, `post: dist/post.js`, under
`using: node24`[^action-yml] — not at anything under `src/`. Someone edits a
file in `src/`, commits it, and the unit test suite (which imports from
`src/`) passes clean.

## What they conclude

The change is shipped: the tests pass, the commit is in, the PR is
mergeable.

## What is true

Nothing under `runs:` reads `src/` at runtime. A consumer of this action —
another repository's workflow — invokes it by executing the files named in
`runs:`, and those are exclusively the `dist/*.js` bundles that
`pnpm build` (`turbo run build:prod`) produces.[^package-json] Until that
build is run again and its output is committed, every consumer keeps running
the old bundle, byte for byte, regardless of what `src/` now contains or
whether its tests pass — the test suite exercises `src/` directly and says
nothing about whether `dist/` reflects it.

## CI does not guard this

No workflow under `.github/workflows/` runs `pnpm build` or diffs `dist/`
against a fresh build; the release workflow here is a thin `uses:` wrapper
around a reusable workflow and does not itself invoke a build/dist-freshness
check, and no pre-commit hook in this repository runs a build either — lint-
staged formats and typechecks staged files, nothing more. So a stale `dist/`
is caught by nothing automated; the discipline that `pnpm build` runs "before
committing action changes" is unenforced and rests entirely on the person or
agent making the change remembering to do it.

[^action-yml]: `../../action.yml`
[^package-json]: `../../package.json`
