import { GitHubMarkdown } from "@effected/github-actions";
import { Array as Arr } from "effect";
import type { ChangeRecord } from "./schema/marketplace.js";
import { pluginKey } from "./schema/marketplace.js";
import type { ReportOutput } from "./schema/report-output.js";

/** First record of each distinct `(marketplace, name)` pair, in order. */
const distinctPairs = (changes: ReadonlyArray<ChangeRecord>): ReadonlyArray<ChangeRecord> =>
	Arr.dedupeWith(changes, (a, b) => pluginKey(a.marketplace, a.pluginName) === pluginKey(b.marketplace, b.pluginName));

const bullet = (c: ChangeRecord): string => {
	const ref = `${c.pluginName}@${c.manifestName}`;
	switch (c.field) {
		case "sha":
			return `- [${c.marketplace}] pinned ${ref} to ${c.value}`;
		case "path":
			return `- [${c.marketplace}] changed path of ${ref} to ${c.value}`;
	}
};

/**
 * The `ai(marketplace): …` subject / PR title.
 *
 * @remarks
 * Three shapes. One pair names its marketplace. One plugin repinned in every
 * marketplace of the run — the usual monorepo release — lists them, because
 * "repinned 2 plugins" would hide that it is one plugin. Anything else counts
 * pairs.
 */
export const commitSubject = (changes: ReadonlyArray<ChangeRecord>): string => {
	const pairs = distinctPairs(changes);
	const [first] = pairs;
	if (first === undefined) {
		return "ai(marketplace): repinned 0 plugins";
	}
	const ref = `${first.pluginName}@${first.manifestName}`;
	const onePlugin = pairs.every((p) => p.pluginName === first.pluginName && p.manifestName === first.manifestName);
	if (onePlugin) {
		return `ai(marketplace): repinned ${ref} (${pairs.map((p) => p.marketplace).join(", ")})`;
	}
	return `ai(marketplace): repinned ${pairs.length} plugins`;
};

/** One bullet per changed field, per plugin. */
export const messageBody = (changes: ReadonlyArray<ChangeRecord>): string => changes.map(bullet).join("\n");

/** Full default commit message: subject, body, and a DCO trailer from the App bot identity. */
export const defaultCommitMessage = (
	changes: ReadonlyArray<ChangeRecord>,
	bot: { readonly name: string; readonly email: string },
): string => `${commitSubject(changes)}\n\n${messageBody(changes)}\n\nSigned-off-by: ${bot.name} <${bot.email}>`;

/** Non-fatal markdown job summary. */
export const buildSummary = (output: ReportOutput): string => {
	const rows: Array<[string, string]> = [
		["Status", output.status],
		["Mode", output.mode],
		["Plugins updated", String(output.pluginsUpdated)],
		["Manifests", output.manifests.length > 0 ? output.manifests.join(", ") : "—"],
		["Dry run", output.dryRun ? "yes" : "no"],
	];
	if (output.commit) {
		rows.push(["Commit", output.commit.url ?? output.commit.sha]);
	}
	if (output.pr) {
		rows.push(["PR", output.pr.url ?? `#${output.pr.number}`]);
	}
	const blocks = [
		GitHubMarkdown.heading("📦 Marketplace Manager", 2),
		GitHubMarkdown.table(["Property", "Value"], rows),
	];
	if (output.plugins.length > 0) {
		blocks.push(
			GitHubMarkdown.list(output.plugins.map((p) => `\`${p.name}\` (${p.marketplace}) — ${p.fields.join(", ")}`)),
		);
	}
	return blocks.join("\n\n");
};
