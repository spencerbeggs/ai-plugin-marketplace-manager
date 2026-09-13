# Decision

* [Dry-run is an early-return guard, not the kit's DryRun service](dry-run-guard-not-dryrun-service.md) - Step 6 of the orchestration is a plain early return emitting a different report, not an instance of @effected/github-actions's DryRun service.
* [Explicit values only, no release lookup](explicit-values-only.md) - The action applies only the url/path/sha values a caller supplies; it never resolves a release, a ref, or a "latest" sentinel to a commit SHA on its own.
* [PR head re-rooted onto base in one ref move](pr-head-rerooted-in-one-ref-move.md) - Every pr-mode run re-roots the head branch at base's current tip, unconditionally, and does so as a single GitBranch.upsert to the already-built commit.
* [The json input is a plugins envelope, not a bare array](json-input-is-a-plugins-envelope.md) - JsonInput is Schema.Struct({ plugins Schema.Array(PluginPatch) }), an object root mirroring marketplace.json's own top-level plugins key.
* [Verified commits via server-side signing](verified-commits-via-server-side-signing.md) - Land commits with a genuine GitHub App installation token and no author/committer/signature, so GitHub server-signs them.
* [ajv runs with strict false against the bundled SchemaStore schema](ajv-strict-false.md) - new Ajv({ strict: false, allErrors: true, logger: false }) validates third-party manifest DATA, not the schema itself; logger:false silences unknown-format warnings since ajv-formats is not shipped.
