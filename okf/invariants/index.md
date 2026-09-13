# Invariant

* [A pr-mode head carries exactly one commit, rooted at base](pr-head-carries-exactly-one-commit-rooted-at-base.md) - After a pr-mode run the head branch is re-rooted at base's current tip and carries exactly one commit; the ref never rests on the bare base head.
* [Commit calls carry no identity](commit-calls-carry-no-identity.md) - No commit request sends author, committer, or signature — GitHub server-signs the commit instead.
* [Landing requires a validated, non-no-op change](landing-requires-a-validated-non-noop-change.md) - Nothing can be committed that is byte-stable or unvalidated — the type system enforces it, not a call-site convention.
* [post revokes the installation token first](post-revokes-the-token-first.md) - The post phase revokes the GitHub App installation token before anything else runs, on success and failure alike, with no opt-out.
