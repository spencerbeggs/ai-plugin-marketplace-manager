---
title: post revokes the installation token first
description: The post phase revokes the GitHub App installation token before anything else runs, on success and failure alike, with no opt-out.
type: Invariant
resource: ../../__test__/post.test.ts
stale_after: 2027-03-13T00:00:00Z
tags:
  - security
  - testing
sources:
  - id: post-phase
    resource: ../../src/post.ts
  - id: post-test
    resource: ../../__test__/post.test.ts
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: d6cde5433566a42324228b6403c227e4aa9f3c666a5957d34754c3653e27cc55
---

# post revokes the installation token first

**Property.** In the `post` phase, `GitHubToken.dispose()` runs before the
run-duration read, and revocation cannot be displaced by anything that
happens later in the phase — including a defect (a thrown error, not a
typed failure) raised by that later read. A live installation token left
un-revoked would be a security-relevant leak, so the ordering is a
guarantee, not an incidental effect of the current code shape.[^post-phase]

**Mechanism.** `post` is written as a single `Effect.gen`: it logs, calls
`GitHubToken.dispose()` wrapped in its own `Effect.catch` (so a revocation
failure only logs a warning), then reads `ActionState` for the start time,
also wrapped in its own `Effect.catch` (so a missing or malformed start-time
record only skips the duration log). The whole generator is wrapped a
second time in `Effect.catchDefect`, so a defect anywhere in the phase logs
a warning instead of failing the run.[^post-phase] Because the two
catches are per-step and the `catchDefect` sits outside the whole
generator, only ordering — revoke, then read — keeps a defect in the
later read from reaching backward and swallowing the revocation.

The test that pins this makes the start-time read `Effect.die` — a defect,
not a typed failure — and asserts the token was still revoked.[^post-test]
That fixture shape is load-bearing: a typed failure from the start-time
read would be caught by that read's own local `Effect.catch` and would
prove nothing about ordering, since `post` already tolerates typed
failures there regardless of sequence. Only a defect exposes the outer
`catchDefect`, which is the mechanism a reordering would actually go
through.

**What a refactor would have to break.** Moving the start-time read (or
any other step) ahead of `GitHubToken.dispose()` would let a defect raised
there reach the outer `catchDefect` before revocation runs, silently
reporting success having revoked nothing — exactly what the "revokes even
when the duration read dies" test is built to catch.[^post-test] A
refactor that simplified that test's fixture from a defect (`Effect.die`)
to a typed failure would make the test pass regardless of ordering,
turning it dead without any source change.

[^post-phase]: `post`'s per-step catches and outer `Effect.catchDefect` are
    at `../../src/post.ts:25-41`; the revoke-then-read sequence is at
    `../../src/post.ts:26-38`.
[^post-test]: The dies-during-duration-read fixture and assertion are at
    `../../__test__/post.test.ts:84-90`; the harness's `startTime` fault
    injection point is defined at `../../__test__/post.test.ts:48-62`.
