# Gotcha

* [A renamed input silently takes the default](renamed-input-silently-takes-the-default.md) - Renaming an input in action.yml or a call site compiles and runs clean, but the code quietly reads nobody's value.
* [Schema.NonEmptyArray no longer fails the ajv strict gate (resolved upstream)](nonemptyarray-blocked-in-published-schemas.md) - Retired: Schema.NonEmptyArray's Draft-07 lowering used to trip ajv's strict-mode gate in a published schema; effected#818 was closed and, from @effected/schemastore 0.28.0, it lowers to a plain minItems: 1, so JsonInput.plugins now uses it directly.
* [marketplace looks like a manual-path signal and isn't](marketplace-input-ignored-for-manual-path-detection.md) - A non-empty marketplace input looks like proof a caller is using the manual path, but it is deliberately excluded from that detection — because a defaulted workflow_dispatch choice input is always non-empty.
* [src edits do nothing until dist is rebuilt](src-edits-do-nothing-until-dist-is-rebuilt.md) - The action runs the committed dist/ bundle; editing and committing src/ alone ships no behavior change.
