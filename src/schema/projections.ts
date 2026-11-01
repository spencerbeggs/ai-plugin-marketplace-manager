import { Array as Arr } from "effect";
import type { ChangeRecord } from "./marketplace.js";
import { pluginKey } from "./marketplace.js";
import type { ReportOutput, ResultStatus } from "./report-output.js";
import { SCHEMA_URL } from "./report-output.js";

/** Inputs to the pure output projection. */
export interface ProjectionInput {
	readonly mode: "commit" | "pr";
	readonly dryRun: boolean;
	readonly changes: ReadonlyArray<ChangeRecord>;
	readonly commitSha: string | null;
	readonly commitUrl: string | null;
	readonly prNumber: number | null;
	readonly prUrl: string | null;
	readonly succeeded: boolean;
	readonly hasFailures: boolean;
}

const deriveStatus = (noop: boolean, succeeded: boolean): ResultStatus =>
	!succeeded ? "failed" : noop ? "no-op" : "success";

type ChangedPlugin = ReportOutput["plugins"][number];

/**
 * Group flat change records into one entry per `(marketplace, name)`,
 * preserving first-seen order (a `Map` iterates in insertion order). Keyed on
 * the pair, not the name: one plugin is routinely repinned in both marketplaces
 * in the same run, and those are two entries in two files.
 */
const groupPlugins = (changes: ReadonlyArray<ChangeRecord>): ReadonlyArray<ChangedPlugin> => {
	const byKey = new Map<string, ChangedPlugin & { fields: Array<ChangeRecord["field"]> }>();
	for (const c of changes) {
		const key = pluginKey(c.marketplace, c.pluginName);
		let entry = byKey.get(key);
		if (entry === undefined) {
			entry = { marketplace: c.marketplace, manifest: c.path, name: c.pluginName, fields: [] };
			byKey.set(key, entry);
		}
		entry.fields.push(c.field);
	}
	return [...byKey.values()];
};

/** Distinct manifest paths the changes touched, first-seen order. */
const touchedManifests = (changes: ReadonlyArray<ChangeRecord>): ReadonlyArray<string> =>
	Arr.dedupe(changes.map((c) => c.path));

/** Project the applied-change set and land outcome into the `result` struct. Pure. */
export const toReportOutput = (input: ProjectionInput): ReportOutput => {
	const plugins = groupPlugins(input.changes);
	const noop = input.changes.length === 0;
	return {
		$schema: SCHEMA_URL,
		mode: input.mode,
		status: deriveStatus(noop, input.succeeded),
		noop,
		succeeded: input.succeeded,
		hasFailures: input.hasFailures,
		dryRun: input.dryRun,
		pluginsUpdated: plugins.length,
		plugins,
		manifests: touchedManifests(input.changes),
		commit: input.commitSha === null ? null : { sha: input.commitSha, url: input.commitUrl },
		pr: input.prNumber === null ? null : { number: input.prNumber, url: input.prUrl },
	};
};
