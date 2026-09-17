# Gotcha

* [A renamed input silently takes the default](renamed-input-silently-takes-the-default.md) - Renaming an input in action.yml or a call site compiles and runs clean, but the code quietly reads nobody's value.
* [src edits do nothing until dist is rebuilt](src-edits-do-nothing-until-dist-is-rebuilt.md) - The action runs the committed dist/ bundle; editing and committing src/ alone ships no behavior change.
