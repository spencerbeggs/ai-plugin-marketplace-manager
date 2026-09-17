---
type: Convention
status: stable
title: Keep the entry-point guard and the env strip together
description: Keep each entry point's GITHUB_ACTIONS guard and vitest.setup.ts's env strip paired; dropping either lets a test run a real phase on a runner.
stale_after: 2027-03-13T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: efc6ae9cf8ae0933787f42c87bbcd7c5ce484d350c0b8eeee49575b426bd856b
tags:
  - testing
  - ci
sources:
  - id: pre
    resource: ../../src/pre.ts
  - id: main
    resource: ../../src/main.ts
  - id: post
    resource: ../../src/post.ts
  - id: vitest-setup
    resource: ../../vitest.setup.ts
  - id: env-test
    resource: ../../__test__/env.test.ts
---

# Keep the entry-point guard and the env strip together

Keep each entry point ending in `if (process.env.GITHUB_ACTIONS) { … }` —
`src/pre.ts`, `src/main.ts`, and `src/post.ts` all do today.[^pre][^main][^post]
Keep `vitest.setup.ts`'s `globalSetup` deleting `GITHUB_*`, `INPUT_*`, and
`STATE_*` variables before the `forks` pool spawns any worker.[^vitest-setup]

These two only work as a pair. Dropping either one means importing an entry
point in a test executes the real phase as an import side effect: on a
runner, that mints and revokes a real installation token instead of running
against a fixture.[^vitest-setup] The guard alone is not enough on a runner,
where `GITHUB_ACTIONS=true` is already set in the ambient environment before
any test process starts; the env strip is what removes that trigger before a
worker ever sees it.

Deleting `INPUT_*` matters independently of the phase-execution risk: a
leaked runner value would silently stand in for a fixture, since
`ActionInput` reads inputs from the mangled `INPUT_*` variables — a test
could pass for the wrong reason without the strip.[^vitest-setup]

`globalSetup` runs once in the Vitest host process before the `forks` pool
spawns, and forked workers inherit `process.env` as it stands at fork time —
so deleting there reaches every test file, but that propagation is an
assumption about the pool rather than a documented Vitest promise.
`__test__/env.test.ts` asserts the strip from inside a worker for exactly
that reason: to catch a regression in the propagation itself, not just in
the deletion code.[^env-test]

[^pre]: ../../src/pre.ts:47
[^main]: ../../src/main.ts:6
[^post]: ../../src/post.ts:44
[^vitest-setup]: ../../vitest.setup.ts:6-24,26-52
[^env-test]: ../../__test__/env.test.ts:3-20
