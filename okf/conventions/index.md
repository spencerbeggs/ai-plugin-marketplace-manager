# Convention

* [Branch on GitHubError.kind, never on message prose](branch-on-github-error-kind.md) - Discriminate library failures by their structured kind, match library errors rather than wrapping them, and add GitHubGraphQLError on the auto-merge path.
* [Keep the Action Contract in Sync](keep-the-action-contract-in-sync.md) - Editing an input or output means editing three places, and an Effect Schema change means regenerating the root JSON Schemas.
* [Keep the entry-point guard and the env strip together](entry-point-guard-and-env-strip-are-a-pair.md) - Keep each entry point's GITHUB_ACTIONS guard and vitest.setup.ts's env strip paired; dropping either lets a test run a real phase on a runner.
* [Never stamp bot identity on commits](never-stamp-bot-identity-on-commits.md) - Never pass author, committer, or signature into a commit call; the bot identity feeds the DCO trailer only.
* [Re-pin Vendored Source on Dependency Bump](re-pin-vendored-source-on-dependency-bump.md) - Bump effect or @effected/github-actions, then re-pin their vendored read-only source so an agent verifies against the installed version.
* [Test doubles transform; fixtures isolate one field](test-doubles-transform-and-fixtures-isolate.md) - Make a double perform the real transformation, make a fixture invalid only in the field under test, and inject the failure an ordering guard actually protects against.
* [Validate the result before landing](validate-the-result-before-landing.md) - Validate the edited manifest before any commit, fail with all reasons on any violation, and mint the branded change only through validateEdit.
