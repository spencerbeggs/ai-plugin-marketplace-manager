import { Action, ActionInput, ActionState, GitHubToken } from "@effected/github-actions";
import { Clock, Effect } from "effect";
import { PreLive } from "./layers/app.js";
import { STATE_KEYS, StartTimeState } from "./state.js";

/**
 * Fine-grained installation permissions this action requires.
 *
 * @remarks
 * Passed to `GitHubToken.provision` as `required`, which **verifies what GitHub
 * actually granted** rather than requesting a scope-down — the same semantics
 * the pre-port `permissions` option had. The check is pure (the granted
 * permissions travel back with the minted token) and runs *before* the token is
 * persisted, so a misconfigured installation fails here naming the missing
 * permission instead of failing mid-`main` with a bare 403.
 */
export const REQUIRED_PERMISSIONS = {
	contents: "write",
	pull_requests: "write",
} as const;

/**
 * The App credentials `pre` reads — split out so the contract test can record
 * these reads without minting a token.
 */
export const readAppCredentials = Effect.all({
	appId: ActionInput.string("app-client-id"),
	privateKey: ActionInput.redacted("app-private-key"),
});

/**
 * pre: record the start time and provision the GitHub App installation token.
 *
 * @remarks
 * The credentials are explicit arguments: the pre-port `provision()` defaulted
 * them from these same two inputs internally, and the kit requires them at the
 * call site instead.
 *
 * The private key is read with `ActionInput.redacted` and stays `Redacted` end
 * to end — it is never unwrapped in this module, and `provision` takes the
 * wrapper directly.
 */
export const pre = Effect.gen(function* () {
	const state = yield* ActionState;
	const startedAt = yield* Clock.currentTimeMillis;
	yield* state.save(STATE_KEYS.startTime, StartTimeState.make({ startedAt }), StartTimeState);

	const { appId, privateKey } = yield* readAppCredentials;

	yield* Effect.logInfo("Generating GitHub App installation token...");
	const token = yield* GitHubToken.provision({ appId, privateKey, required: REQUIRED_PERMISSIONS });
	yield* Effect.logInfo(`Token generated (expires: ${token.expiresAt})`);
});

/* v8 ignore next 3 */
if (process.env.GITHUB_ACTIONS) {
	await Action.run(pre, { layer: PreLive });
}
