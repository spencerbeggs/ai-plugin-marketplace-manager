---
"ai-plugin-marketplace-manager": patch
---

## Bug Fixes

- The `commit-url` output is now built from the runner's `GITHUB_SERVER_URL` rather than a hard-coded `https://github.com`, so it links to the right host on GitHub Enterprise Server.
- An invalid `mode` or `auto-merge` value now fails with an error naming the input, the value given and the allowed values.
