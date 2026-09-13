---
type: Decision
title: Dry-run is an early-return guard, not the kit's DryRun service
description: Step 6 of the orchestration is a plain early return emitting a different report, not an instance of @effected/github-actions's DryRun service.
status: draft
tags:
  - architecture
sources:
  - id: program
    resource: ../../src/program.ts
    title: "the dry-run guard in runOrchestration (program.ts:99)"
generated:
  by: okfit/claude-code
---

# Dry-run is an early-return guard, not the kit's DryRun service

## Context

`@effected/github-actions` ships a `DryRun` service that models a *wrapped
mutation with a fallback*: run this effect, or substitute a given value when
the run is dry. This action needed a way to validate a manifest edit, report
what would happen, and stop before landing anything when `dry-run` is set —
and the kit's `DryRun` service was evaluated as the natural fit before this
decision was made.

## Decision

Model dry-run as a plain early return in `runOrchestration`, not as an
instance of the kit's `DryRun` service. After the result is validated
(step 5), the orchestration checks `inputs.dryRun` (`program.ts:99`) and, if
set, emits a report built from the validated changes and returns before
reaching the landing code at all[^program]. This is not the "wrapped mutation with a
fallback" shape `DryRun` models: dry-run here emits a **different report**
than the landed path does (no commit SHA, no PR number, `dryRun: true`), and
never touches `ManifestCommitter.land`. There is no single effect being run
in one case and substituted in the other — there are two different terminal
paths.

The `dryRun` boolean also does work outside the landing decision: it feeds
the output projection (`toReportOutput`'s `dryRun` field) and the job summary
independently of whether a mutation ran at all. Because it has to exist as a
plain value regardless, adopting `DryRun` would mean threading that value
through a service built around a mutation-substitution shape this code does
not have — adding a service to carry a flag that already has to be carried
as a flag.

## Alternatives rejected

- **`@effected/github-actions`'s `DryRun` service.** Rejected because its
  model — wrap a mutating effect, substitute a fallback value when dry — does
  not match this pipeline's shape. Dry-run here is an early return to a
  different report and code path, not a substituted return value from an
  otherwise-identical call site. Adopting it would have required fabricating
  the "wrapped mutation" shape the orchestration does not naturally have,
  purely to reuse the service.

## Consequences

- The dry-run guard is a plain `if (inputs.dryRun)` branch in
  `runOrchestration`, read and modified like any other control flow in
  `program.ts` — there is no service boundary to cross or mock when testing
  it.
- Because dry-run is checked after validation (step 5) and before landing,
  every dry run exercises full structural and semantic validation; only the
  commit/PR step is skipped.
- `dryRun` remains a plain boolean threaded through `ParsedInputs`, the
  report projection, and the job summary, rather than a value obtained from
  a `DryRun` service call.

[^program]: `program.ts` — the dry-run guard in `runOrchestration`
