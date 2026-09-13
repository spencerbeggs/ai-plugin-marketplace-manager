---
title: Commit calls carry no identity
description: No commit request sends author, committer, or signature — GitHub server-signs the commit instead.
type: Invariant
resource: ../../__test__/services/ManifestCommitter.test.ts
stale_after: 2027-03-13T00:00:00Z
tags:
  - security
sources:
  - id: git-commit-shape
    resource: ../../.repos/effected/packages/github/src/GitCommit.ts
  - id: manifest-committer-test
    resource: ../../__test__/services/ManifestCommitter.test.ts
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: 090228407007384f34441b86d37756c2c03c9db9c71adba21f2e26664924208a
---

# Commit calls carry no identity

**Property.** Every commit this action creates carries no `author`,
`committer`, or `signature` field in the request that creates it, so
GitHub server-signs the commit rather than this action asserting an
identity for it.

**Mechanism.** `@effected/github`'s `GitCommitShape` interface — the only
surface this repository's code has for building a commit — declares
`get`, `createTree`, `createCommit`, and `commitFiles`. `createCommit`'s
options are exactly `{ message, tree, parents }`; none of the four members
accepts an author, committer, or signature parameter of any
kind.[^git-commit-shape] There is no such parameter to omit by convention:
the rule is structural, not a discipline a call site has to remember.

A test asserts this from the request side rather than the type side: it
records the request's own keys, sorted, before any destructuring, and
asserts they are exactly `["message", "parents", "tree"]` — the keys a
rebuilt object could only ever have would prove nothing, so the harness
names the caller's actual request.[^manifest-committer-test] The same test
asserts the bot identity reaches the commit only as the `message` text,
never as a separate field.

**What a refactor would have to break.** Adding author, committer, or
signature information to a commit created through this action would
require `@effected/github`'s `GitCommitShape.createCommit` to grow a new
parameter — a change to a dependency this repository does not own — and
would still fail the keys assertion in
`../../__test__/services/ManifestCommitter.test.ts:313-327` the moment a
caller here passed it, since that test asserts the *exact* key set rather
than a subset.

See `../decisions/verified-commits-via-server-side-signing.md` for why
server-side signing is the chosen mechanism, and
`../conventions/never-stamp-bot-identity-on-commits.md` for the rule this
invariant makes structural.

[^git-commit-shape]: `GitCommitShape.createCommit`'s three-field options
    type is declared at
    `../../.repos/effected/packages/github/src/GitCommit.ts:81-85`, inside
    the wider interface at
    `../../.repos/effected/packages/github/src/GitCommit.ts:72-113`.
[^manifest-committer-test]: "B1: never passes an author, committer or
    signature field" is at
    `../../__test__/services/ManifestCommitter.test.ts:313-327`; the
    `commitRequestKeys` recording mechanism is defined at
    `../../__test__/services/ManifestCommitter.test.ts:63-68,115-123`.
</content>
