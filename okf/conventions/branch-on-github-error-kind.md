---
type: Convention
title: Branch on GitHubError.kind, never on message prose
description: Discriminate library failures by their structured kind, match library errors rather than wrapping them, and add GitHubGraphQLError on the auto-merge path.
stale_after: 2027-03-13T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: dc15bb36a93f7c2241a1ee09b0d8e420f58229902389cc698f12cb4fe3aa3c67
tags:
  - architecture
sources:
  - id: manifest-committer
    resource: ../../src/services/ManifestCommitter.ts
  - id: github-error
    resource: ../../.repos/effected/packages/github/src/GitHubError.ts
  - id: git-branch
    resource: ../../.repos/effected/packages/github/src/GitBranch.ts
  - id: pull-request
    resource: ../../.repos/effected/packages/github/src/PullRequest.ts
---

# Branch on GitHubError.kind, never on message prose

Discriminate a `@effected/github` failure by its structured `kind` field —
values like `"alreadyExists"` or `"notFound"` — never by matching text in its
message.[^github-error] Match a library error as it arrives; never wrap it in
a repository-defined error type before branching on it, since that would
throw away the structural discriminant the library already provides.

`land`'s error channel is `GitHubError | GitHubGraphQLError |
InvalidInputError`, propagated straight from `@effected/github` rather than
translated into a local taxonomy.[^manifest-committer] The auto-merge step —
`PullRequest.setAutoMerge`, called after the pull request is opened — adds
`GitHubGraphQLError` to that channel, since it runs over the GraphQL API
rather than REST.[^pull-request]

This code never needs to match `kind` itself, because the one place a `kind`
discriminant matters for `land`'s own control flow — recovering from a
concurrent branch creation during the `pr`-mode ref move — is handled inside
`GitBranch.upsert` in the library, which recognizes `kind: "alreadyExists"`
structurally and resets onto the intended sha rather than failing the whole
operation.[^manifest-committer][^git-branch] Losing that structural check —
for example by wrapping the error before it reaches `upsert`, or by
special-casing on the error's message instead — would turn an expected,
recoverable race into a hard failure.

[^manifest-committer]: ../../src/services/ManifestCommitter.ts:1,76-78,94-96
[^github-error]: ../../.repos/effected/packages/github/src/GitHubError.ts:53,94,100,109,115
[^git-branch]: ../../.repos/effected/packages/github/src/GitBranch.ts:41,207,210
[^pull-request]: ../../.repos/effected/packages/github/src/PullRequest.ts:201-204
