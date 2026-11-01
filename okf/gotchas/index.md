# Gotcha

* [A renamed input silently takes the default](renamed-input-silently-takes-the-default.md) - Renaming an input in action.yml or a call site compiles and runs clean, but the code quietly reads nobody's value.
* [Schema.NonEmptyArray looks safe here and fails the ajv strict gate](nonemptyarray-blocked-in-published-schemas.md) - Schema.NonEmptyArray is the obvious spelling for "plugins must be non-empty" and type-checks fine, but its Draft-07 lowering trips ajv's strict-mode gate in a published schema until effected#818 is fixed.
* [marketplace looks like a manual-path signal and isn't](marketplace-input-ignored-for-manual-path-detection.md) - A non-empty marketplace input looks like proof a caller is using the manual path, but it is deliberately excluded from that detection — because a defaulted workflow_dispatch choice input is always non-empty.
* [src edits do nothing until dist is rebuilt](src-edits-do-nothing-until-dist-is-rebuilt.md) - The action runs the committed dist/ bundle; editing and committing src/ alone ships no behavior change.
