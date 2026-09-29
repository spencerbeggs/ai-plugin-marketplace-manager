---
type: Convention
status: stable
title: Never stamp bot identity on commits
description: Never pass author, committer, or signature into a commit call; the bot identity feeds the DCO trailer only.
stale_after: 2027-03-13T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-09-29T03:16:59Z
  body_sha256: af58fb69e05ab8f8b01682f709b47d6807ca0ed62e311e16a81203de11e8a327
tags:
  - security
sources:
  - id: manifest-committer
    resource: ../../src/services/ManifestCommitter.ts
  - id: manifest-committer-test
    resource: ../../__test__/services/ManifestCommitter.test.ts
  - id: report
    resource: ../../src/report.ts
---

# Never stamp bot identity on commits

Never pass `GitHubToken.botIdentity()` — or any `author`, `committer`, or
`signature` value — into a commit call.[^manifest-committer] `land`'s
`createCommit` call passes only `message`, `tree`, and `parents`.[^manifest-committer]
Feed the bot identity into the DCO `Signed-off-by:` trailer inside the commit
message text, and nowhere else.[^report]

`GitCommit` from `@effected/github` exposes no `author`, `committer`, or
`signature` parameter, so this rule is structural rather than a habit to
remember: there is no field to reach for by mistake in the normal call
path.[^manifest-committer] Do not reintroduce a path that could stamp one —
for example a raw REST call that bypasses `GitCommit` — since doing so would
undo the reason these commits arrive verified: an installation token commits
with no author/committer identity of its own, so GitHub signs the commit
server-side.

A test pins this at the argument level rather than trusting the remarks: it
records every key the caller actually passed to `createCommit`, before any
destructuring, and asserts the recorded key set is exactly
`["message", "parents", "tree"]`.[^manifest-committer-test] That assertion
fails the moment any caller adds `author`, `committer`, or `signature` to the
request, so it catches a regression the type signature alone would not.

See [Verified commits via server-side signing](../decisions/verified-commits-via-server-side-signing.md)
for why an unsigned commit from an installation token arrives verified at all.

[^manifest-committer]: ../../src/services/ManifestCommitter.ts:51-55,136-140
[^manifest-committer-test]: `../../__test__/services/ManifestCommitter.test.ts:84-89,136-141,344`
[^report]: ../../src/report.ts:56,60
