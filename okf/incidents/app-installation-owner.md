---
type: Incident
title: pre failed for every consumer once the App gained a second installation
description: An ownerless token mint worked only while the GitHub App had exactly one installation; pre now always names the owner, and a test pins that it never falls back.
occurred: 2026-11-16
guard: ../../__test__/pre.test.ts
status: draft
tags:
  - github
  - ci
sources:
  - id: issue-253
    resource: https://github.com/spencerbeggs/ai-plugin-marketplace-manager/issues/253
    title: "pre fails when the GitHub App has multiple installations"
    last_modified: 2026-11-21T17:31:52Z
  - id: pre
    resource: ../../src/pre.ts
    title: readAppCredentials, resolveAppOwner and the provision call
  - id: pre-test
    resource: ../../__test__/pre.test.ts
    title: The five tests that pin the owner on the mint request
  - id: github-app-kit
    resource: ../../.repos/effected/packages/github/src/GitHubApp.ts
    title: "GitHubApp's installation discovery"
generated:
  by: okfit/claude-code
  at: 2026-11-21T21:05:58Z
integrity:
  generated:
    body: 00136a23b410d96c
---

# pre failed for every consumer once the App gained a second installation

## What shipped broken

`pre` minted the installation token with
`GitHubToken.provision({ appId, privateKey, required })` — no `owner` and no
`installationId`.[^issue-253] With neither on the request, `GitHubApp` lists
the App's installations and can pick one only when there is exactly one; any
other count is a typed `GitHubAppError`.[^github-app-kit] The action
therefore carried a hidden precondition on the App's configuration that
nothing in this repository could see or test.

## What the consumer saw

Every run failed in `pre`, before any manifest was read:

```text
Generating GitHub App installation token...
Action failed: [GitHubAppError]: GitHub App installation failed: the app has 3 installations; pass installationId or owner
```

The misleading part is that nothing in the action or the calling workflow
had changed. The same action commit (`41572e8`, release 2.0.22) passed on
2026-11-13 and failed on 2026-11-16, and release 2.0.23 failed identically;
the only difference was that the App behind `app-client-id` had been
installed on more accounts in between.[^issue-253] It was hit in
[spencerbeggs/bot](../consumers/spencerbeggs-bot.md), and it would have
failed every consumer sharing that App on its next run.

## Root cause

The request never said whose installation it wanted. Discovery by "the only
installation" is not a property of the action; it is a property of how many
accounts the App happens to be installed on, which changes outside this
repository and outside every consumer's workflow.

## The guard

`pre` now always names an owner. `readAppCredentials` reads a third,
optional input, `app-owner`, and `resolveAppOwner` returns it when it is
non-empty and otherwise reads `GITHUB_REPOSITORY_OWNER` from
`ActionEnvironment`; `pre` passes the result to `provision` as
`owner`.[^pre] A consumer whose App is installed on the account that owns
the repository needs no workflow change. See
[action-inputs](../interfaces/action-inputs.md) for the input and
[marketplace-manager](../modules/marketplace-manager.md) for the phase.

Two rules follow, and both are pinned rather than left to review:

- **Never fall back to an ownerless mint.** When `app-owner` is empty and
  `GITHUB_REPOSITORY_OWNER` is unavailable, `pre` fails with a typed
  `ActionEnvironmentError` and mints nothing. Making the owner optional
  "for robustness" would reintroduce this incident silently: it would pass
  for every single-installation App and fail the day a second one appears.
- **The override does not read the value it replaces.** The runner variable
  is read only when the input is absent, so a set `app-owner` works even
  where `GITHUB_REPOSITORY_OWNER` is not available.

`__test__/pre.test.ts` runs `pre` against a `GitHubApp` double that records
the mint request and asserts five things: the owner defaults to the
repository owner, `app-owner` overrides it, an empty `app-owner` reads as
unset, the override succeeds with no repository owner available, and with
neither available `pre` fails having sent no request at all.[^pre-test] The
fixture's repository owner is deliberately not `acme`:
`ActionEnvironment.layerTest` seeds `GITHUB_REPOSITORY_OWNER: "acme"` by
default, so an assertion on `acme` would pass against a harness that
ignored the environment it was given.

Naming the owner changes the failure a misconfigured consumer sees rather
than removing it: an App that is not installed on the named account now
fails in `pre` with `the app is not installed on <owner>` and the list of
accounts it is installed on.[^github-app-kit] That consumer sets
`app-owner`.

[^issue-253]: <https://github.com/spencerbeggs/ai-plugin-marketplace-manager/issues/253>
[^pre]: `../../src/pre.ts:31-35` (`readAppCredentials`), `:51-54`
    (`resolveAppOwner`), `:73-77` (the `provision` call)
[^pre-test]: `../../__test__/pre.test.ts:57-106`
[^github-app-kit]: `../../.repos/effected/packages/github/src/GitHubApp.ts:917-924`
