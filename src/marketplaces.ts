import type { ValidateFunction } from "ajv";
import Ajv from "ajv";
import { Predicate } from "effect";
// JSON asset imports, not relative TS/JS module imports: the `.json` extension
// is the real one and must survive the builder's `forceJsExtensions` rewrite.
import claudeCodeSchema from "./schema/claude-code-marketplace.json" with { type: "json" };
import copilotSchema from "./schema/copilot-marketplace.json" with { type: "json" };
import type { MarketplaceId } from "./schema/input.js";

const SHA_RE = /^[0-9a-f]{40}$/;
const GITHUB_URL_RE = /^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?\/?$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// `strict: false` is deliberate: we validate DATA against third-party schemas,
// not strict-lint the schemas themselves. `logger: false` silences "unknown
// format" warnings (no `ajv-formats`); semantic checks re-validate the fields
// that matter for touched plugins.
const ajv = new Ajv({ strict: false, allErrors: true, logger: false });

/**
 * One marketplace kind: where its manifest lives and how an edited manifest of
 * that kind is validated.
 *
 * @remarks
 * Plain data so the pipeline stays marketplace-agnostic. Adding a kind is a new
 * descriptor plus a literal in `MarketplaceId`; `program.ts` does not change.
 */
export interface Marketplace {
	readonly id: MarketplaceId;
	/** Fixed manifest path within the checkout. */
	readonly path: string;
	/** Compiled structural schema for the whole manifest. */
	readonly validateStructural: ValidateFunction;
	/** Semantic errors for one patched entry's `source`; empty when valid. */
	readonly sourceErrors: (name: string, source: unknown) => ReadonlyArray<string>;
}

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
	Predicate.isObject(value) ? (value as Record<string, unknown>) : null;

const shaErrors = (name: string, s: Readonly<Record<string, unknown>>): ReadonlyArray<string> =>
	typeof s.sha === "string" && SHA_RE.test(s.sha) ? [] : [`${name}: source.sha must be 40-hex lowercase`];

/** Claude Code: pinnable entries are `git-subdir` sources. */
export const CLAUDE_CODE: Marketplace = {
	id: "claude-code",
	path: ".claude-plugin/marketplace.json",
	validateStructural: ajv.compile(claudeCodeSchema as object),
	sourceErrors: (name, source) => {
		const s = asRecord(source);
		if (s === null) {
			return [`${name}: source.source must be "git-subdir"`];
		}
		return [
			...(s.source === "git-subdir" ? [] : [`${name}: source.source must be "git-subdir"`]),
			...(typeof s.url === "string" && GITHUB_URL_RE.test(s.url) ? [] : [`${name}: source.url must be a GitHub URL`]),
			...(typeof s.path === "string" && s.path.length > 0 ? [] : [`${name}: source.path must be non-empty`]),
			...shaErrors(name, s),
		];
	},
};

/** GitHub Copilot: pinnable entries are `github` sources; `path` is optional. */
export const COPILOT: Marketplace = {
	id: "copilot",
	path: ".github/plugin/marketplace.json",
	validateStructural: ajv.compile(copilotSchema as object),
	sourceErrors: (name, source) => {
		const s = asRecord(source);
		if (s === null) {
			return [`${name}: source.source must be "github"`];
		}
		return [
			...(s.source === "github" ? [] : [`${name}: source.source must be "github"`]),
			...(typeof s.repo === "string" && REPO_RE.test(s.repo) ? [] : [`${name}: source.repo must be owner/name`]),
			...(s.path === undefined || (typeof s.path === "string" && s.path.length > 0)
				? []
				: [`${name}: source.path must be non-empty when present`]),
			...shaErrors(name, s),
		];
	},
};

/** Descriptor lookup by id. */
export const MARKETPLACES: Readonly<Record<MarketplaceId, Marketplace>> = {
	"claude-code": CLAUDE_CODE,
	copilot: COPILOT,
};

/** Fixed processing order, so commit content and output ordering are deterministic. */
export const MARKETPLACE_ORDER = ["claude-code", "copilot"] as const satisfies ReadonlyArray<MarketplaceId>;
