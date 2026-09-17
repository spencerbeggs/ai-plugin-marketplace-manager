---
type: Glossary
title: verified commit
description: What "verified" means for a commit this action lands, and the two things it is not.
status: stable
generated:
  by: okfit/claude-code
  at: 2026-09-13T21:33:34Z
  body_sha256: b65858454d9a0233cdd4ac013f696735b466e8980daa518212c605a580dd2714
tags: [security]
---

# verified commit

In this repository, a "verified" commit is GitHub's own server-side
signature badge on a commit created through the API by a GitHub App
installation token — the state GitHub shows when it can attest the commit
came from the identity the token represents, which is what satisfies a
branch protection rule requiring signed commits.

`land` (`src/services/ManifestCommitter.ts:90-155`) achieves this by never
passing an author, committer, or signature to `GitCommit`; `@effected/github`
exposes no parameter for any of the three, so the rule is structural rather
than a convention someone has to remember not to break. Omitting them is
exactly what lets GitHub sign the commit server-side on behalf of the App
installation.

## Not the same as two other things

- **Not a DCO `Signed-off-by:` trailer.** This repository's commits also
  carry a `Signed-off-by:` line generated from `GitHubToken.botIdentity()`
  (`src/program.ts:116-122`), but that trailer is plain commit-message
  text — a Developer Certificate of Origin attestation this repository
  separately requires, with no bearing on whether GitHub marks the commit
  verified.
- **Not okfit's own frontmatter `verified` field.** That field on an OKF
  concept records third-party or human confirmation of a claim in this
  bundle; it shares a name with GitHub's commit badge and nothing else.
