# Gotcha

* [A renamed input silently takes the default](renamed-input-silently-takes-the-default.md) - Renaming an input in action.yml or a call site compiles and runs clean, but the code quietly reads nobody's value.
* [effect rc.113 opened the generated JSON Schema objects](effect-rc113-opened-generated-json-schema-objects.md) - A drift-test failure after an effect bump, and the schema flip it reports, both look like a broken contract when the pipeline already closed it back up.
* [src edits do nothing until dist is rebuilt](src-edits-do-nothing-until-dist-is-rebuilt.md) - The action runs the committed dist/ bundle; editing and committing src/ alone ships no behavior change.
