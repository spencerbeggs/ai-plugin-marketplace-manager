---
"ai-plugin-marketplace-manager": minor
---

## Bug Fixes

- The `pre` phase no longer fails once the GitHub App is installed on more than one account. It previously minted the installation token without naming an account, which only worked while the App had exactly one installation; after a second install every run failed with `GitHub App installation failed: the app has N installations; pass installationId or owner`. The token is now always minted for a named account, by default the owner of the repository the workflow runs in. If no owner can be determined, the phase fails instead of attempting an ownerless mint. Existing workflows need no changes. Fixes #253.

## Features

- New optional `app-owner` input mints the installation token for the App's installation on a different account than the repository owner. It defaults to empty, which means the repository owner.

```yaml
- uses: spencerbeggs/ai-plugin-marketplace-manager@v2
  with:
    app-client-id: ${{ secrets.APP_CLIENT_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
    app-owner: another-account
```
