---
"ai-plugin-marketplace-manager": patch
---

## Build System

- The committed `dist/` bundles are now built by `effected action build` from the `[action]` tables in `effected.toml`, replacing `@savvy-web/github-action-builder` and `action.config.ts`. The inputs, outputs and behaviour are unchanged, and each bundle is about 57 KB smaller.
