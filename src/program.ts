import type { ActionOutputsShape } from "@effected/github-actions";
import { ActionOutputs, GitHubToken } from "@effected/github-actions";
import { Array as Arr, Cause, Effect } from "effect";
import type { ParsedInputs } from "./inputs.js";
import { parseInputs } from "./inputs.js";
import { MARKETPLACES, MARKETPLACE_ORDER } from "./marketplaces.js";
import { buildSummary, commitSubject, defaultCommitMessage, messageBody } from "./report.js";
import type { ChangeRecord } from "./schema/marketplace.js";
import { toReportOutput } from "./schema/projections.js";
import { ReportOutput } from "./schema/report-output.js";
import { land, resolveBaseBranch } from "./services/ManifestCommitter.js";
import { applyPatches, readManifest } from "./services/ManifestEditor.js";
import type { ValidatedManifestChange } from "./services/ManifestValidator.js";
import { validateEdit } from "./services/ManifestValidator.js";

/** Emit the structured result (non-fatal), convenience scalars, and the job summary (non-fatal). */
const emit = (outputs: ActionOutputsShape, output: ReportOutput) =>
	Effect.gen(function* () {
		yield* outputs
			.setJson("result", output, ReportOutput)
			.pipe(Effect.catch((e) => Effect.logWarning(`Failed to emit result: ${String(e)}`)));
		yield* outputs.set("status", output.status);
		yield* outputs.set("changed", output.succeeded && !output.noop ? "true" : "false");
		yield* outputs.set("mode", output.mode);
		yield* outputs.set("commit-sha", output.commit?.sha ?? "");
		yield* outputs.set("commit-url", output.commit?.url ?? "");
		yield* outputs.set("pr-number", output.pr === null ? "" : String(output.pr.number));
		yield* outputs.set("pr-url", output.pr?.url ?? "");
		yield* outputs.set("plugins-updated", String(output.pluginsUpdated));
		yield* outputs
			.summary(buildSummary(output))
			.pipe(Effect.catch((e) => Effect.logWarning(`Failed to write summary: ${String(e)}`)));
	});

/**
 * Emit a structured failed `result` (best-effort) for the given mode/dry-run.
 *
 * @remarks
 * "Best-effort" is enforced here rather than assumed at the call sites. Both
 * callers run this *before* re-raising the cause that actually failed the run,
 * so anything escaping this effect would short-circuit the `yield*` and take
 * the place of that cause — the run would then report an output-write problem
 * instead of the validation or API error that caused it, which is precisely
 * the diagnostic a failing run exists to deliver.
 *
 * `emit` guards its own `setJson` and `summary` calls, but the eight plain
 * `outputs.set` writes between them are unguarded and each one touches the
 * runner's file descriptor, so this is a reachable failure rather than a
 * theoretical one. `catchCause` rather than `catch` because a defect displaces
 * the real cause just as effectively as a typed failure.
 */
const emitFailure = (outputs: ActionOutputsShape, mode: "commit" | "pr", dryRun: boolean) =>
	emit(
		outputs,
		toReportOutput({
			mode,
			dryRun,
			changes: [],
			commitSha: null,
			commitUrl: null,
			prNumber: null,
			prUrl: null,
			succeeded: false,
			hasFailures: true,
		}),
	).pipe(Effect.catchCause((cause) => Effect.logWarning(`Failed to emit failure result: ${Cause.pretty(cause)}`)));

/** Read, edit, validate, and land the manifest change once inputs are parsed. */
const runOrchestration = (outputs: ActionOutputsShape, inputs: ParsedInputs) =>
	Effect.gen(function* () {
		// 1–5 per marketplace: read, edit, no-op guard, validate. Every targeted
		// manifest is validated before anything lands, so one bad file stops the
		// whole run — all-or-nothing across files, not just within one.
		const validated: Array<ValidatedManifestChange> = [];
		const changes: Array<ChangeRecord> = [];
		for (const id of MARKETPLACE_ORDER) {
			const patches = inputs.patches.filter((p) => p.marketplace === id);
			if (patches.length === 0) {
				continue;
			}
			const m = MARKETPLACES[id];
			const text = yield* readManifest(m);
			const edit = yield* applyPatches(m, text, patches);
			if (!edit.changed) {
				yield* Effect.logInfo(`Step: edit ${m.path} — SKIPPED: no changes`);
				continue;
			}
			// `edit` has narrowed to ChangedEdit; `validateEdit` mints the branded
			// change `land` requires.
			validated.push(
				yield* validateEdit(
					m,
					edit,
					patches.map((p) => p.name),
				),
			);
			changes.push(...edit.changes);
		}

		if (!Arr.isReadonlyArrayNonEmpty(validated)) {
			yield* Effect.logInfo("Step: edit — SKIPPED: no changes in any manifest; nothing to commit");
			const output = toReportOutput({
				mode: inputs.mode,
				dryRun: inputs.dryRun,
				changes: [],
				commitSha: null,
				commitUrl: null,
				prNumber: null,
				prUrl: null,
				succeeded: true,
				hasFailures: false,
			});
			yield* emit(outputs, output);
			return;
		}

		if (inputs.dryRun) {
			yield* Effect.logInfo("Step: land — SKIPPED: dry run");
			const output = toReportOutput({
				mode: inputs.mode,
				dryRun: true,
				changes,
				commitSha: null,
				commitUrl: null,
				prNumber: null,
				prUrl: null,
				succeeded: true,
				hasFailures: false,
			});
			yield* emit(outputs, output);
			return;
		}

		// Messages (defaults from the change set; DCO trailer from the bot identity).
		// Computed only on the land path — dry-run never reads the token identity, so
		// the dry-run test needs no provisioned token.
		const bot = yield* GitHubToken.botIdentity();
		const commitMessage = inputs.commitMessage ?? defaultCommitMessage(changes, bot);
		const prTitle = inputs.prTitle ?? commitSubject(changes);
		const prBody = inputs.prBody ?? messageBody(changes);

		// 6: land.
		const base = yield* resolveBaseBranch(inputs.baseBranch);
		const result = yield* land({
			mode: inputs.mode,
			base,
			branch: inputs.branch,
			changes: validated,
			commitMessage,
			prTitle,
			prBody,
			autoMerge: inputs.autoMerge,
		});

		const output = toReportOutput({
			mode: inputs.mode,
			dryRun: false,
			changes,
			commitSha: result.commitSha,
			commitUrl: result.commitUrl,
			prNumber: result.prNumber,
			prUrl: result.prUrl,
			succeeded: true,
			hasFailures: false,
		});
		yield* emit(outputs, output);
	});

/**
 * The main orchestration program. A typed failure (input parsing, validation,
 * or landing) still emits a structured failed `result` before re-raising, so
 * downstream consumers see the modeled `status: "failed"` / `hasFailures: true`
 * state — and the action still exits non-zero via `Action.run`.
 */
export const program = Effect.gen(function* () {
	const outputs = yield* ActionOutputs;

	// Inputs never parsed; fall back to the commit-mode, non-dry-run defaults.
	const inputs = yield* parseInputs.pipe(Effect.tapCause(() => emitFailure(outputs, "commit", false)));

	yield* runOrchestration(outputs, inputs).pipe(
		Effect.tapCause(() => emitFailure(outputs, inputs.mode, inputs.dryRun)),
	);
});
