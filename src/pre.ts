import { Action, ActionEnvironment, ActionInput, ActionState, GitHubToken } from "@effected/github-actions";
import { Clock, Config, Effect } from "effect";
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
 * The App inputs `pre` reads — split out so the contract test can record
 * these reads without minting a token.
 *
 * @remarks
 * `appOwner` is `""` when the input is omitted: the runner supplies an unset
 * input as the empty string, and {@link resolveAppOwner} reads that as "not
 * set".
 */
export const readAppCredentials = Effect.all({
	appId: ActionInput.string("app-client-id"),
	privateKey: ActionInput.redacted("app-private-key"),
	appOwner: ActionInput.string("app-owner").pipe(Config.withDefault("")),
});

/**
 * The account whose installation of the App the token is minted for.
 *
 * @remarks
 * `app-owner` when given, otherwise the owner of the repository the workflow
 * runs in (`GITHUB_REPOSITORY_OWNER`). An owner is **always** named: without
 * one, `GitHubApp` can only pick an installation when the App has exactly
 * one, so an action that worked would start failing in `pre` the day the App
 * was installed on a second account. A missing `GITHUB_REPOSITORY_OWNER`
 * therefore fails typed here rather than falling back to an ownerless mint.
 *
 * The runner variable is read only when the input is absent, so the override
 * does not depend on the value it replaces.
 */
export const resolveAppOwner = (appOwner: string) =>
	appOwner !== ""
		? Effect.succeed(appOwner)
		: Effect.flatMap(ActionEnvironment, (env) => env.get("GITHUB_REPOSITORY_OWNER"));

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

	const { appId, privateKey, appOwner } = yield* readAppCredentials;
	const owner = yield* resolveAppOwner(appOwner);

	yield* Effect.logInfo(`Generating GitHub App installation token for ${owner}...`);
	const token = yield* GitHubToken.provision({ appId, privateKey, owner, required: REQUIRED_PERMISSIONS });
	yield* Effect.logInfo(`Token generated (expires: ${token.expiresAt})`);
});

/* v8 ignore next 3 */
if (process.env.GITHUB_ACTIONS) {
	await Action.run(pre, { layer: PreLive });
}
