import { assert, describe, it } from "@effect/vitest";
import type { TokenRequest } from "@effected/github";
import { AppIdentity, GitHubApp, InstallationToken } from "@effected/github";
import { ActionEnvironment, ActionInput, ActionOutputs, ActionState } from "@effected/github-actions";
import { ConfigProvider, DateTime, Effect, Exit, Layer, Redacted } from "effect";
import { pre } from "../src/pre.js";

const minted = InstallationToken.make({
	token: Redacted.make("ghs_minted"),
	expiresAt: DateTime.fromDateUnsafe(new Date(Date.now() + 60 * 60 * 1000)),
	installationId: 1,
	permissions: { contents: "write", pull_requests: "write" },
});

interface Harness {
	/** Every request `pre` sent to `GitHubApp.token`. */
	readonly requests: Array<TokenRequest>;
	readonly layer: Layer.Layer<GitHubApp | ActionState | ActionOutputs | ActionEnvironment>;
}

/**
 * `pre` wired to a `GitHubApp` double that records the mint request.
 *
 * @param env the runner environment — where `GITHUB_REPOSITORY_OWNER` lives.
 * @param inputs the action inputs, by their `action.yml` names.
 */
const harness = (env: Readonly<Record<string, string>>, inputs: Readonly<Record<string, string>>): Harness => {
	const requests: Array<TokenRequest> = [];
	const layer = Layer.mergeAll(
		GitHubApp.layerTest({
			token: (request) =>
				Effect.sync(() => {
					requests.push(request);
					return minted;
				}),
			// `provision` decorates the minted token with the app's identity.
			identity: () => Effect.succeed(AppIdentity.make({ slug: "repin-bot", name: "Repin Bot" })),
		}),
		ActionState.layerTest({ save: () => Effect.void }),
		ActionOutputs.recording().layer,
		ActionEnvironment.layerTest(env),
	).pipe(Layer.provideMerge(ConfigProvider.layer(ActionInput.provider(inputs))));
	return { requests, layer };
};

const CREDENTIALS = { "app-client-id": "Iv1.abc", "app-private-key": "pem" };

// Deliberately not "acme": `ActionEnvironment.layerTest` seeds that as the
// default `GITHUB_REPOSITORY_OWNER`, so asserting it would pass against a
// harness that ignored the override entirely.
const REPO_OWNER = { GITHUB_REPOSITORY_OWNER: "widgets-inc" };

// The double always seeds an owner, so "absent" has to be arranged: an empty
// variable reads as absent, as the runner treats it.
const NO_REPO_OWNER = { GITHUB_REPOSITORY_OWNER: "" };

describe("pre", () => {
	// Issue #253: with no owner on the request, `GitHubApp` can only pick an
	// installation when the App has exactly one. The mint must name the account.
	it.effect("mints for the installation on the repository owner's account", () =>
		Effect.gen(function* () {
			const h = harness(REPO_OWNER, CREDENTIALS);
			yield* pre.pipe(Effect.provide(h.layer));
			assert.lengthOf(h.requests, 1);
			assert.strictEqual(h.requests[0]?.owner, "widgets-inc");
			assert.strictEqual(h.requests[0]?.appId, "Iv1.abc");
		}),
	);

	it.effect("lets app-owner override the repository owner", () =>
		Effect.gen(function* () {
			const h = harness(REPO_OWNER, { ...CREDENTIALS, "app-owner": "other-org" });
			yield* pre.pipe(Effect.provide(h.layer));
			assert.strictEqual(h.requests[0]?.owner, "other-org");
		}),
	);

	// An omitted input arrives as "", which must read as "not set" — not as an
	// owner named "".
	it.effect("treats an empty app-owner as unset", () =>
		Effect.gen(function* () {
			const h = harness(REPO_OWNER, { ...CREDENTIALS, "app-owner": "" });
			yield* pre.pipe(Effect.provide(h.layer));
			assert.strictEqual(h.requests[0]?.owner, "widgets-inc");
		}),
	);

	// The override must not depend on the runner variable it replaces.
	it.effect("does not read the repository owner when app-owner is given", () =>
		Effect.gen(function* () {
			const h = harness(NO_REPO_OWNER, { ...CREDENTIALS, "app-owner": "other-org" });
			yield* pre.pipe(Effect.provide(h.layer));
			assert.strictEqual(h.requests[0]?.owner, "other-org");
		}),
	);

	// Falling back to an ownerless mint would reintroduce the bug silently.
	it.effect("fails without minting when neither owner is available", () =>
		Effect.gen(function* () {
			const h = harness(NO_REPO_OWNER, CREDENTIALS);
			const exit = yield* pre.pipe(Effect.provide(h.layer), Effect.exit);
			assert.isTrue(Exit.isFailure(exit));
			assert.lengthOf(h.requests, 0);
		}),
	);
});
