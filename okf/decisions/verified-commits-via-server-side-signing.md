---
type: Decision
title: Verified commits via server-side signing
description: Land commits with a genuine GitHub App installation token and no author/committer/signature, so GitHub server-signs them.
status: draft
tags:
  - security
sources:
  - id: committer
    resource: ../../src/services/ManifestCommitter.ts
    title: "land() never passes author/committer/signature"
  - id: report
    resource: ../../src/report.ts
    title: DCO trailer built as commit message text
  - id: program
    resource: ../../src/program.ts
    title: botIdentity() read only on the land path
  - id: layers
    resource: ../../src/layers/app.ts
    title: token minted in pre, read back via clientLayer()
  - id: pre
    resource: ../../src/pre.ts
    title: GitHubToken.provision in pre
  - id: gitcommit-kit
    resource: ../../.repos/effected/packages/github/src/GitCommit.ts
    title: "GitCommit.createCommit/commitFiles accept no identity parameter"
  - id: silk-update-action
    resource: 'conversation with the repository owner'
    title: savvy-web/silk-update-action as reference implementation
generated:
  by: okfit/claude-code
---

# Verified commits via server-side signing

## Context

The prior bash/git-CLI implementation of this action pushed commits over the
git CLI, authenticated with a GitHub App installation token. That commit is
not GPG-verified, so "require signed commits" branch protection rejected it —
including on the base branch, which the action needs to commit to directly in
`commit` mode. The replacement had to produce commits GitHub marks
`verified: true` without shipping or managing any signing key.

## Decision

Rely on GitHub's own server-side commit signing, which fires when three facts
hold together at once:

1. **The token is a genuine GitHub App installation access token, not a
   PAT.** `pre` mints it with `GitHubToken.provision({ appId, privateKey,
   required })`[^pre] and persists it to cross-phase state; `main` reads it
   back and builds the Octokit client from it via `GitHubToken.clientLayer()`,
   bound to a `const` so the parameterized factory is not called more than
   once per composition (layers memoize by reference)[^layers].
2. **The commit call sends no custom author, committer, or signature.**
   `ManifestCommitter.land` builds `changes = [new FileContent({ path,
   content })]` and passes them to `commit.commitFiles` (commit mode) or the
   `commit.get` → `commit.createTree` → `commit.createCommit` sequence (pr
   mode) with no identity arguments[^committer]. This is enforced structurally
   rather than by discipline: `GitCommit.createCommit` and `commitFiles` in
   `@effected/github` accept only `message`/`tree`/`parents` (or
   `branch`/`message`/`changes`) — there is no author/committer/signature
   parameter a caller could pass even by mistake[^gitcommit-kit].
3. **GitHub server-signs an API commit made by a bot/App token when the
   request omits custom author/committer/signature**, returning `verified:
   true` and attributing the commit to the App's bot identity. A server
   signature satisfies "require signed commits" branch protection, which is
   what makes commit-direct-to-base work. PATs do not trigger this behavior;
   App tokens do.

DCO sign-off is layered on top, not fused into the signing mechanism: the
generated commit message carries a `Signed-off-by: <name> <email>` trailer
built from `GitHubToken.botIdentity()`, composed as **message text** in
`defaultCommitMessage`[^report]. Because this is text and not an
author/committer field, it does not disturb auto-signing, and because GitHub
sets the commit's actual author to the same App bot identity (a consequence of
omitting the fields), the commit is simultaneously verified and carries a
valid DCO from its true author.

`program.ts` reads `GitHubToken.botIdentity()` only on the land path, after
the dry-run guard[^program]. Dry runs never read the token identity, so the
dry-run code path needs no provisioned token — an ergonomics and testing
property, not an accident.

The reference implementation for this pattern in this codebase's ecosystem is
`savvy-web/silk-update-action`, which ships the same shape: a `GitCommit`
layer wired from the token client, committed with no author, on a
feature-branch-then-PR flow[^silk-update-action]. This action's
commit-direct-to-base mode additionally depends on fact 3 above, which
`silk-update-action`'s PR-only flow does not need.

## Alternatives rejected

- **git-CLI push authenticated with the App token.** This is the
  pre-replacement behavior and is not server-signed; branch protection
  requiring signed commits rejects it. This was the original defect the
  rewrite exists to fix.
- **A personal access token (PAT).** PATs do not trigger GitHub's server-side
  signing behavior for omitted-identity commits — only bot/App tokens do.
  Using a PAT would reproduce the same unverified-commit failure with a
  different credential.
- **Stamping `GitHubToken.botIdentity()` onto the commit's author/committer
  fields.** This was considered and rejected: doing so would defeat
  auto-signing, since fact 2 (an omitted identity) is the precondition for
  fact 3 (server-side signing). The bot identity is sanctioned only in the
  commit **message** as the DCO trailer, never as an author/committer
  argument.

## Consequences

- Any change that introduces an author/committer/signature argument to the
  commit call breaks the acceptance invariant and must be rejected in
  review: `commit` mode must land a verified commit on the base branch that
  passes signed-commit branch protection, and `pr` mode's commit must
  likewise be verified.
- Because `GitCommit` exposes no identity parameter at all, the type system
  now enforces the rule that used to depend on discipline — there is nothing
  a caller could pass even by mistake.
- Dry-run needs no provisioned token, since `botIdentity()` is read only on
  the land path, after the dry-run guard.

[^pre]: `pre.ts` — `GitHubToken.provision({ appId, privateKey, required })`
[^layers]: `layers/app.ts` — `client = GitHubToken.clientLayer().pipe(Layer.orDie)`
[^committer]: `services/ManifestCommitter.ts` — `land()`
[^gitcommit-kit]: `@effected/github`'s `GitCommit.createCommit`/`commitFiles`
[^report]: `report.ts` — `defaultCommitMessage()`
[^program]: `program.ts` — `const bot = yield* GitHubToken.botIdentity();`
[^silk-update-action]: savvy-web/silk-update-action reference implementation
