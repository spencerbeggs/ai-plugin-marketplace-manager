import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Yaml } from "@effected/yaml";
import { Result, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { INPUT_DEFAULTS, INPUT_NAMES, OUTPUT_NAMES } from "../src/contract.js";
import { INPUT_SCHEMA_URL, InputSchemaIdentity, OutputSchemaIdentity } from "../src/schema/input.js";
import { SCHEMA_URL } from "../src/schema/report-output.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (rel: string): string => readFileSync(resolve(REPO_ROOT, rel), "utf8");

// Only the shape this test reasons about. `Schema.Record` keeps the manifest
// free to carry keys we do not model (`branding`, `runs`) without this decode
// becoming a second place to maintain the contract.
const InputDecl = Schema.Struct({ default: Schema.optional(Schema.String) });
const OutputDecl = Schema.Struct({ description: Schema.optional(Schema.String) });
const ActionManifest = Schema.Struct({
	inputs: Schema.Record(Schema.String, InputDecl),
	outputs: Schema.Record(Schema.String, OutputDecl),
});

const manifest = (() => {
	const parsed = Yaml.parseResult(read("action.yml"));
	if (Result.isFailure(parsed)) {
		throw new Error(`action.yml did not parse: ${String(parsed.failure)}`);
	}
	const decoded = Schema.decodeUnknownResult(ActionManifest)(parsed.success);
	if (Result.isFailure(decoded)) {
		throw new Error(`action.yml has no usable inputs/outputs maps: ${String(decoded.failure)}`);
	}
	return decoded.success;
})();

// The source text of every module that performs a read or a write. Reading the
// source is the only way to see the call sites: a name reaching `ActionInput`
// or `outputs.set` is spelled as a string literal and appears in no type, so
// there is nothing else for a test to hold on to.
const SOURCES = ["src/inputs.ts", "src/pre.ts", "src/program.ts"].map(read).join("\n");

/** Does some `ActionInput.<accessor>("name")` call appear in the sources? */
const isRead = (name: string): boolean =>
	new RegExp(String.raw`ActionInput\.\w+\(${JSON.stringify(name)}\)`).test(SOURCES);

/**
 * Does some `outputs.set("name", ...)` call appear in the sources?
 *
 * @remarks
 * The whitespace tolerance is load-bearing rather than defensive: the formatter
 * breaks the longest of these calls across lines, so `outputs` and `.setJson`
 * are separated by a newline and a tab in the file as committed.
 */
const isWritten = (name: string): boolean =>
	new RegExp(String.raw`outputs\s*\.\s*set\w*\(\s*${JSON.stringify(name)}`).test(SOURCES);

describe("action contract", () => {
	// Leg 1: action.yml <-> contract.ts. Catches an input added to the manifest
	// but never declared here, and a name dropped from the manifest that the
	// code still believes in.
	describe("action.yml agrees with the declared contract", () => {
		it("declares exactly the inputs in INPUT_NAMES", () => {
			expect(Object.keys(manifest.inputs).sort()).toEqual([...INPUT_NAMES].sort());
		});

		it("declares exactly the outputs in OUTPUT_NAMES", () => {
			expect(Object.keys(manifest.outputs).sort()).toEqual([...OUTPUT_NAMES].sort());
		});

		it("gives every mirrored input the default the contract states", () => {
			const fromManifest = Object.fromEntries(
				Object.keys(INPUT_DEFAULTS).map((name) => [name, manifest.inputs[name]?.default]),
			);
			expect(fromManifest).toEqual({ ...INPUT_DEFAULTS });
		});

		it("leaves every other optional input defaulting to the empty string", () => {
			// Guards the reasoning INPUT_DEFAULTS is built on: inputs.ts maps "" to
			// "missing", so an unmirrored input quietly acquiring a real default
			// would change behavior with nothing here to notice.
			const mirrored = new Set<string>(Object.keys(INPUT_DEFAULTS));
			const required = new Set(["app-client-id", "app-private-key"]);
			for (const [name, decl] of Object.entries(manifest.inputs)) {
				if (mirrored.has(name) || required.has(name)) continue;
				expect(decl.default, `input "${name}" has an unmirrored non-empty default`).toBe("");
			}
		});
	});

	// Leg 2: contract.ts <-> the code. Catches the rename that lands in the
	// manifest and the contract but misses the call site — the failure mode with
	// no compile error and no runtime error, just an input silently defaulting.
	describe("the source reads and writes every declared name", () => {
		it.each([...INPUT_NAMES])('reads input "%s"', (name) => {
			expect(isRead(name), `no ActionInput read for "${name}"`).toBe(true);
		});

		// `result` needs no special case: it is written with the schema-backed
		// `outputs.setJson`, which the `set\w*` in the pattern already covers.
		it.each([...OUTPUT_NAMES])('writes output "%s"', (name) => {
			expect(isWritten(name), `no outputs.set for "${name}"`).toBe(true);
		});
	});

	// Leg 3: the hosted schema URLs <-> the prose that quotes them. The code and
	// the generated documents share one derivation (`HostedSchema.$id`, checked
	// by `pnpm schema:check`), but action.yml and the README spell the URL and
	// the file paths by hand, and a version bump that misses them fails nothing.
	describe("the documentation quotes the derived schema locations", () => {
		const readme = read("README.md");

		it("action.yml points the result output at SCHEMA_URL", () => {
			expect(manifest.outputs.result?.description).toContain(SCHEMA_URL);
		});

		it("README quotes SCHEMA_URL as the example $schema", () => {
			expect(readme).toContain(`"$schema": "${SCHEMA_URL}"`);
		});

		it("README links the committed documents at their generated paths", () => {
			expect(readme).toContain(`(schemas/${OutputSchemaIdentity.fileName})`);
			expect(readme).toContain(`(schemas/${InputSchemaIdentity.fileName})`);
		});

		it("derives both URLs from the versioned layout", () => {
			expect(SCHEMA_URL).toBe(
				"https://raw.githubusercontent.com/spencerbeggs/claude-code-marketplace-manager/main/schemas/1.0/output.json",
			);
			expect(INPUT_SCHEMA_URL).toBe(
				"https://raw.githubusercontent.com/spencerbeggs/claude-code-marketplace-manager/main/schemas/1.0/input.json",
			);
		});
	});
});
