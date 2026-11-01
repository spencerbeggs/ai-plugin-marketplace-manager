---
type: Decision
title: Fixed manifest paths per marketplace, no discovery
description: claude-code and copilot each map to exactly one hardcoded manifest path; a path input per marketplace and Copilot's four-location discovery were both rejected.
status: stable
tags:
  - architecture
sources:
  - id: marketplaces
    resource: ../../src/marketplaces.ts
    title: "the Marketplace descriptor's fixed path field"
  - id: design-spec
    resource: ../../docs/superpowers/specs/2026-09-23-v2-multi-marketplace-design.md
    title: "§2 Marketplace descriptors and Out of scope"
generated:
  by: okfit/claude-code
  at: 2026-09-23T20:44:15Z
verified:
  - by: human:spencer
    at: 2026-11-01T19:17:03Z
integrity:
  generated:
    body: dd86d86c936b8f23
  verified:
    by: human:spencer
    at: 2026-11-01T19:17:03Z
    content: 5a10384913888332
---

# Fixed manifest paths per marketplace, no discovery

## Context

v2 adds a second marketplace kind (Copilot) alongside Claude Code. Each
kind's manifest has one conventional location in a consuming repository:
`.claude-plugin/marketplace.json` for Claude Code, `.github/plugin/marketplace.json`
for Copilot. GitHub Copilot's own plugin tooling additionally supports
discovering a `marketplace.json` across up to four candidate locations in a
repository, rather than requiring one fixed path.

## Decision

Each marketplace kind owns exactly one fixed path, declared as data on its
`Marketplace` descriptor (`src/marketplaces.ts`) and never taken from an
input: `claude-code` is always `.claude-plugin/marketplace.json`; `copilot`
is always `.github/plugin/marketplace.json`. `marketplace` in the action's
inputs selects which descriptor a patch uses; it never carries or overrides
a path. There is no `path`-per-marketplace action input and no directory
search.

## Alternatives rejected

- **A path input per marketplace** (e.g. `claude-code-path`,
  `copilot-path`, or a `path` field on each patch naming the manifest file
  rather than the entry's `source.path`). Rejected: precision by design
  means this action changes only explicit, narrow values; making the
  manifest location itself configurable widens the action's surface for a
  case (a repository keeping its manifest somewhere nonstandard) that has
  not arisen and that a fixed convention already serves for every known
  consumer.
- **Copilot's four-location discovery.** Rejected for the same reason, and
  because discovery reintroduces exactly the kind of implicit resolution
  this action's design already refuses elsewhere — see
  [explicit-values-only](explicit-values-only.md) for the analogous refusal
  of ref→sha resolution. Discovering a path at runtime means the manifest a
  run edits depends on which of several files exist in the checkout at
  that moment, not on anything the caller stated.

## Consequences

- A repository that keeps either manifest at a nonstandard path cannot use
  this action for that manifest without moving the file to the fixed path.
- Adding a third marketplace kind is a new descriptor with its own fixed
  path plus a new literal in `MarketplaceId`; the pipeline (`program.ts`)
  does not change, since it only ever iterates `MARKETPLACE_ORDER` and asks
  each descriptor for its own path.
- `ManifestNotFoundError` names the fixed path a targeted marketplace was
  expected at, so a caller who targeted the wrong marketplace kind — rather
  than the wrong path — gets a report naming the marketplace, not a
  generic file-not-found.
