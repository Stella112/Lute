// Deterministic Build workflow (contract §27).
//
// This is the narrow, auditable first workflow for Lute: scaffold an ERC-4626
// candidate for a Base vault from the reviewed template, validate the generated
// manifest, optionally run Graph codegen/build, and return the exact candidate hash.
// It deliberately stops before verification and deployment; those steps must remain
// explicit so an AI or build process cannot approve or deploy its own output.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { buildCandidateManifest, type CandidateManifest } from "./candidate.js";

const execFileAsync = promisify(execFile);
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DEFAULT_TEMPLATE = resolve(dirname(fileURLToPath(import.meta.url)), "../subgraph");

export type BuildStageName = "intent" | "scaffold" | "validate" | "dependencies" | "compile";
export type BuildStage = {
  name: BuildStageName;
  status: "PASSED" | "SKIPPED" | "FAILED";
  detail: string;
};

export type BuildRequest = {
  intent: string;
  contract?: string;
  startBlock: string | bigint;
  outputDir: string;
  templateDir?: string;
  compile?: boolean;
  graphCommand?: string;
};

export type BuildResult = {
  schemaVersion: 1;
  workflow: "BUILD";
  network: "base";
  standard: "ERC-4626";
  contract: string;
  startBlock: string;
  candidateDir: string;
  candidate: CandidateManifest;
  stages: BuildStage[];
};

export class BuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildError";
  }
}

function parseContract(intent: string, explicit?: string): string {
  const contract = explicit ?? intent.match(/0x[0-9a-fA-F]{40}/)?.[0];
  if (!contract || !ADDRESS.test(contract)) {
    throw new BuildError("a valid Base vault contract address is required (0x + 40 hex characters)");
  }
  return contract;
}

function parseStartBlock(value: string | bigint): string {
  const text = value.toString();
  if (!/^\d+$/.test(text)) throw new BuildError("startBlock must be a non-negative decimal integer");
  return BigInt(text).toString();
}

function assertSupportedIntent(intent: string): void {
  if (!/erc[ -]?4626/i.test(intent)) throw new BuildError("the first build workflow supports ERC-4626 intents only");
  if (!/\bbase\b/i.test(intent)) throw new BuildError("the first build workflow supports Base only");
}

function replaceManifest(template: string, contract: string, startBlock: string): string {
  const addressLine = /(^\s+address:\s*)"?0x[0-9a-fA-F]{40}"?/m;
  const startLine = /(^\s+startBlock:\s*)\d+/m;
  if (!addressLine.test(template) || !startLine.test(template)) throw new BuildError("honest template is missing address or startBlock");
  return template
    .replace(addressLine, `$1"${contract}"`)
    .replace(startLine, `$1${startBlock}`);
}

function copyTemplate(templateDir: string, outputDir: string, contract: string, startBlock: string): void {
  const honestManifest = join(templateDir, "subgraph.honest.yaml");
  const schema = join(templateDir, "schema.graphql");
  const mapping = join(templateDir, "src", "mapping.ts");
  const abi = join(templateDir, "abis", "ERC4626.json");
  for (const path of [honestManifest, schema, mapping, abi]) {
    if (!existsSync(path)) throw new BuildError(`template is missing ${path}`);
  }

  mkdirSync(join(outputDir, "src"), { recursive: true });
  mkdirSync(join(outputDir, "abis"), { recursive: true });
  writeFileSync(join(outputDir, "subgraph.yaml"), replaceManifest(readFileSync(honestManifest, "utf8"), contract, startBlock));
  copyFileSync(schema, join(outputDir, "schema.graphql"));
  copyFileSync(mapping, join(outputDir, "src", "mapping.ts"));
  copyFileSync(abi, join(outputDir, "abis", "ERC4626.json"));

  // Keep the candidate independently buildable with Graph CLI.
  const packagePath = join(templateDir, "package.json");
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { scripts?: Record<string, string> };
    if (pkg.scripts) {
      for (const [key, value] of Object.entries(pkg.scripts)) pkg.scripts[key] = value.replaceAll("subgraph.honest.yaml", "subgraph.yaml");
    }
    writeFileSync(join(outputDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  }
  const lockPath = join(templateDir, "package-lock.json");
  if (existsSync(lockPath)) copyFileSync(lockPath, join(outputDir, "package-lock.json"));
}

function validateCandidate(outputDir: string, contract: string, startBlock: string): void {
  const manifestPath = join(outputDir, "subgraph.yaml");
  const manifest = readFileSync(manifestPath, "utf8");
  if (!/network:\s*base\b/i.test(manifest)) throw new BuildError("generated manifest must target Base");
  if (!manifest.toLowerCase().includes(`address: "${contract.toLowerCase()}"`)) throw new BuildError("generated manifest address mismatch");
  if (!new RegExp(`startBlock:\\s*${startBlock}\\b`).test(manifest)) throw new BuildError("generated manifest startBlock mismatch");
  for (const path of ["schema.graphql", "src/mapping.ts", "abis/ERC4626.json"]) {
    if (!existsSync(join(outputDir, path))) throw new BuildError(`generated candidate is missing ${path}`);
  }
}

async function compileCandidate(outputDir: string, graphCommand: string): Promise<string> {
  try {
    if (!existsSync(join(outputDir, "node_modules", "@graphprotocol", "graph-ts"))) {
      await execFileAsync(process.env.NPM_CLI ?? "npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
        cwd: outputDir,
        maxBuffer: 4 * 1024 * 1024,
      });
    }
    await execFileAsync(graphCommand, ["codegen", "subgraph.yaml"], { cwd: outputDir, maxBuffer: 4 * 1024 * 1024 });
    await execFileAsync(graphCommand, ["build", "subgraph.yaml"], { cwd: outputDir, maxBuffer: 4 * 1024 * 1024 });
    return "Graph codegen and build completed";
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    throw new BuildError(`Graph codegen/build failed: ${detail}`);
  }
}

export async function buildErc4626(request: BuildRequest): Promise<BuildResult> {
  assertSupportedIntent(request.intent);
  const contract = parseContract(request.intent, request.contract);
  const startBlock = parseStartBlock(request.startBlock);
  const outputDir = resolve(request.outputDir);
  const templateDir = resolve(request.templateDir ?? DEFAULT_TEMPLATE);
  const stages: BuildStage[] = [{ name: "intent", status: "PASSED", detail: "recognized Base ERC-4626 build intent" }];

  mkdirSync(outputDir, { recursive: true });
  copyTemplate(templateDir, outputDir, contract, startBlock);
  stages.push({ name: "scaffold", status: "PASSED", detail: "created honest schema, mapping, ABI, and Base manifest" });
  validateCandidate(outputDir, contract, startBlock);
  stages.push({ name: "validate", status: "PASSED", detail: "manifest and required execution files validated" });

  if (request.compile === false) {
    stages.push({ name: "dependencies", status: "SKIPPED", detail: "candidate dependency installation skipped with compile" });
    stages.push({ name: "compile", status: "SKIPPED", detail: "Graph codegen/build skipped by request" });
  } else {
    stages.push({ name: "dependencies", status: "PASSED", detail: "candidate Graph dependencies will be installed if absent" });
    const detail = await compileCandidate(outputDir, request.graphCommand ?? process.env.GRAPH_CLI ?? "graph");
    stages.push({ name: "compile", status: "PASSED", detail });
  }

  return {
    schemaVersion: 1,
    workflow: "BUILD",
    network: "base",
    standard: "ERC-4626",
    contract,
    startBlock,
    candidateDir: outputDir,
    candidate: buildCandidateManifest(outputDir),
    stages,
  };
}
