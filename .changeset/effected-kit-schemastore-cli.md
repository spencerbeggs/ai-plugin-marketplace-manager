---
"ai-plugin-marketplace-manager": patch
---

## Dependencies

| Dependency                   | Type          | Action  | From   | To     |
| :--------------------------- | :------------ | :------ | :----- | :----- |
| @effected/github-actions     | dependency    | updated | 0.18.1 | 0.19.0 |
| @effected/schemastore        | dependency    | updated | 0.16.0 | 0.17.0 |
| @effected/schemastore-cli    | devDependency | updated | 0.16.0 | 0.17.0 |
| @effected/pnpm-plugin-effect | config        | updated | 0.12.1 | 0.12.4 |

## Build System

* Adds the `name` field that `@effected/schemastore-cli` 0.17 now requires in `schemastore.config.ts`. The published JSON Schema documents are unchanged.
* Rebuilds the bundled `dist/` against `@effected/github-actions` 0.19.0.
