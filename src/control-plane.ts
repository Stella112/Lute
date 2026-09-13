// Unified Build -> Verify -> Repair -> Gate -> Deploy workflows.
//
// This module is deliberately the only adapter used by the HTTP dashboard and the
// MCP server. It composes the existing deterministic primitives; it does not invent
// verdicts, accept caller-controlled paths, or make deployment an implicit action.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { runAudit } from "./audit.js";
import { buildErc4626, type BuildResult } from "./build.js";
import { buildCandidateManifest, type CandidateManifest } from "./candidate.js";
import { decideGate, type GateDecision } from "./gate.js";
import { buildDeploymentPlan, executeDeploymentPlan, type DeploymentCommand, type DeploymentCommandResult } from "./deploy.js";
import { evidenceRoot } from "./evidence.js";
import { createRepairContext, applyKnownErc4626Repair, type RepairContext } from "./repair.js";
import { createVerificationRun, freshnessFor, loadVerificationRun, requiredStrongChecksPassed, saveVerificationRun, type VerificationRun } from "./run-store.js";
import { createIntegrityPackArtifact, type IntegrityPackArtifact } from "./integrity-pack.js";
import { newRunId, Logger } from "./logger.js";
import { loadMonitoringTargets, runMonitoring } from "./monitoring.js";
import { resolveVerifierRpc } from "./rpc.js";
import { makeSource } from "./sources.js";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const DEFAULT_CANDIDATE_DIR = process.env.LUTE_CANDIDATE_DIR ?? "subgraph";

export class WorkflowError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 422, message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export type WorkflowBuildRequest = {
  intent: string;
  contract?: string;
  startBlock: string | number;
  compile?: boolean;
};

export type WorkflowBuild = {
  schemaVersion: 1;
  buildId: string;
  createdAt: string;
  result: BuildResult;
};

export type WorkflowVerifyRequest = {
  contract: string;
  event?: "Deposit" | "Withdraw";
  fromBlock: string | number;
  toBlock: string | number;
  subgraph?: string;
  candidateRef?: string;
  minConfirmations?: string | number;
};

export type WorkflowVerification = { run: VerificationRun; file: string; candidateRef: string };

export type WorkflowGate = {
  candidate: CandidateManifest;
  verifiedRun: VerificationRun;
  gate: GateDecision;
  candidateRef: string;
};

export type WorkflowDeployment = {
  schemaVersion: 1;
  dryRun: boolean;
  candidate: CandidateManifest;
  verificationRunId: string;
  gate: GateDecision;
  candidateRef: string;
  plan: DeploymentCommand[];
  receipt?: {
    schemaVersion: 1;
    deployedAt: string;
    target: "graph-node";
    name: string;
    node: string;
    ipfs: string;
    versionLabel: string;
    candidateHash: string;
    verificationRunId: string;
    steps: Array<{ purpose: DeploymentCommand["purpose"]; command: string; args: string[]; skipped: boolean }>;
    file: string;
  };
  results?: DeploymentCommandResult[];
};

function workflowRoot(): string {
  return resolve(process.env.LUTE_WORKFLOW_DIR ?? ".lute/workflows");
}

function buildsRoot(): string { return join(workflowRoot(), "builds"); }
function deploymentsRoot(): string { return join(workflowRoot(), "deployments"); }

function ensureInside(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolved = resolve(candidate);
  const rel = relative(resolvedRoot, resolved);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new WorkflowError(422, "workflow path escapes the configured workflow directory");
  }
  return resolved;
}

function publicBuild(build: WorkflowBuild): WorkflowBuild {
  return build;
}

function saveBuild(build: WorkflowBuild): string {
  const file = ensureInside(buildsRoot(), join(buildsRoot(), `${build.buildId}.json`));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(build, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  return file;
}

function loadBuild(buildId: string): WorkflowBuild {
  if (!SAFE_ID.test(buildId)) throw new WorkflowError(400, "candidateRef must be a valid build id or current");
  const file = ensureInside(buildsRoot(), join(buildsRoot(), `${buildId}.json`));
  if (!existsSync(file)) throw new WorkflowError(404, `build not found: ${buildId}`);
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as WorkflowBuild;
    if (parsed.schemaVersion !== 1 || parsed.buildId !== buildId || !parsed.result?.candidateDir) throw new Error("invalid build record");
    return parsed;
  } catch (error) {
    throw new WorkflowError(422, `invalid build record: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function loadWorkflowRun(runId: string): VerificationRun {
  if (typeof runId !== "string" || !SAFE_ID.test(runId)) throw new WorkflowError(400, "runId must be a persisted verification id");
  return loadVerificationRun(runId);
}

export function integrityPackWorkflow(runId: string): IntegrityPackArtifact {
  const run = loadWorkflowRun(runId);
  return createIntegrityPackArtifact(run, run.payment);
}

export function listWorkflowBuilds(limit = 25): WorkflowBuild[] {
  const root = buildsRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      try {
        const parsed = JSON.parse(readFileSync(join(root, name), "utf8")) as WorkflowBuild;
        return parsed.schemaVersion === 1 && SAFE_ID.test(parsed.buildId) ? [parsed] : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, Math.max(0, limit));
}

export async function monitorWorkflow() {
  const candidate = buildCandidateManifest(resolve(DEFAULT_CANDIDATE_DIR));
  const targets = loadMonitoringTargets();
  return runMonitoring(targets, { candidate, logger: new Logger(newRunId()) });
}

function resolveCandidate(candidateRef = "current"): { ref: string; dir: string } {
  if (typeof candidateRef !== "string") throw new WorkflowError(400, "candidateRef must be current or an opaque build id");
  if (candidateRef === "current") return { ref: "current", dir: resolve(DEFAULT_CANDIDATE_DIR) };
  const build = loadBuild(candidateRef);
  return { ref: build.buildId, dir: ensureInside(workflowRoot(), build.result.candidateDir) };
}

function parseBlock(value: string | number | undefined, name: string): bigint {
  const text = String(value ?? "");
  if (!/^\d+$/.test(text)) throw new WorkflowError(400, `${name} must be a non-negative decimal integer`);
  return BigInt(text);
}

function validateContract(contract: string): void {
  if (!ADDRESS.test(contract)) throw new WorkflowError(400, "contract must be a valid EVM address");
}

export async function buildWorkflow(input: WorkflowBuildRequest): Promise<WorkflowBuild> {
  if (typeof input.intent !== "string" || input.intent.trim().length < 8 || input.intent.length > 2000) {
    throw new WorkflowError(400, "intent must be a non-empty build instruction");
  }
  if (input.contract !== undefined && typeof input.contract !== "string") throw new WorkflowError(400, "contract must be a string address");
  if (input.compile !== undefined && typeof input.compile !== "boolean") throw new WorkflowError(400, "compile must be boolean");
  parseBlock(input.startBlock, "startBlock");
  const buildId = newRunId();
  const candidateDir = ensureInside(buildsRoot(), join(buildsRoot(), buildId, "candidate"));
  const result = await buildErc4626({
    intent: input.intent,
    contract: input.contract,
    startBlock: String(input.startBlock),
    outputDir: candidateDir,
    compile: input.compile ?? false,
  });
  const build: WorkflowBuild = { schemaVersion: 1, buildId, createdAt: new Date().toISOString(), result };
  saveBuild(build);
  return publicBuild(build);
}

export async function verifyWorkflow(input: WorkflowVerifyRequest): Promise<WorkflowVerification> {
  if (typeof input.contract !== "string") throw new WorkflowError(400, "contract must be a string address");
  if (input.event !== undefined && input.event !== "Deposit" && input.event !== "Withdraw") throw new WorkflowError(400, "event must be Deposit or Withdraw");
  if (input.subgraph !== undefined && typeof input.subgraph !== "string") throw new WorkflowError(400, "subgraph must be a string");
  if (input.candidateRef !== undefined && typeof input.candidateRef !== "string") throw new WorkflowError(400, "candidateRef must be a string");
  validateContract(input.contract);
  const eventName = input.event ?? "Deposit";
  const fromBlock = parseBlock(input.fromBlock, "fromBlock");
  const toBlock = parseBlock(input.toBlock, "toBlock");
  if (toBlock < fromBlock) throw new WorkflowError(400, "toBlock must be greater than or equal to fromBlock");
  const candidate = resolveCandidate(input.candidateRef);
  const runId = newRunId();
  const logger = new Logger(runId);
  const rpc = resolveVerifierRpc(logger);
  const source = makeSource(input.subgraph ?? "morpho", input.contract, eventName, rpc, { allowRemoteGraphNodeUrl: true });
  const report = await runAudit({
    rpc,
    contract: input.contract,
    eventName,
    fromBlock,
    toBlock,
    subgraph: source,
    logger,
    runId,
    minConfirmations: input.minConfirmations === undefined ? undefined : parseBlock(input.minConfirmations, "minConfirmations"),
  });
  const manifest = buildCandidateManifest(candidate.dir);
  const run = createVerificationRun({ report, candidate: manifest, evidenceRoot: report.evidenceRoot ?? evidenceRoot(report) });
  const file = saveVerificationRun(run);
  return { run, file, candidateRef: candidate.ref };
}

export function repairWorkflow(runId: string, candidateRef = "current", applyKnownFix = false): { context: RepairContext; candidate?: CandidateManifest; applied: { changed: boolean; file: string } | null; reverifyRequired: boolean } {
  const run = loadWorkflowRun(runId);
  if (typeof applyKnownFix !== "boolean") throw new WorkflowError(400, "applyKnownFix must be boolean");
  const context = createRepairContext(run);
  if (!applyKnownFix) return { context, applied: null, reverifyRequired: run.verdict !== "VERIFIED" };
  if (run.verdict !== "FAILED") throw new WorkflowError(409, "known repair may only be applied to a FAILED VerificationRun");
  const candidate = resolveCandidate(candidateRef);
  const applied = applyKnownErc4626Repair(candidate.dir);
  if (!applied.changed) throw new WorkflowError(422, `known ERC-4626 identity repair did not match ${applied.file}`);
  const updated = { ...createRepairContext(run), recommendedActions: [`Applied known identity repair to ${applied.file}; candidate hash must be recomputed and reverified.`, ...context.recommendedActions] };
  return { context: updated, candidate: buildCandidateManifest(candidate.dir), applied, reverifyRequired: true };
}

export function gateWorkflow(runId: string, candidateRef = "current"): WorkflowGate {
  const run = loadWorkflowRun(runId);
  const candidate = resolveCandidate(candidateRef);
  const manifest = buildCandidateManifest(candidate.dir);
  const gate = decideGate({
    verdict: run.report.verdict,
    candidateHash: manifest.candidateHash,
    verifiedCandidateHash: run.candidateHash,
    requiredStrongChecksPassed: requiredStrongChecksPassed(run.report.checks),
    sourcesComplete: run.coverage.sourcesComplete,
    freshnessOk: freshnessFor(run),
    revoked: run.revoked,
  });
  return { candidate: manifest, verifiedRun: run, gate, candidateRef: candidate.ref };
}

export async function deployWorkflow(input: {
  runId: string;
  candidateRef?: string;
  dryRun?: boolean;
  confirm?: boolean;
  name?: string;
  node?: string;
  ipfs?: string;
  versionLabel?: string;
}): Promise<WorkflowDeployment> {
  if (typeof input.runId !== "string") throw new WorkflowError(400, "runId must be a string");
  if (input.candidateRef !== undefined && typeof input.candidateRef !== "string") throw new WorkflowError(400, "candidateRef must be a string");
  if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") throw new WorkflowError(400, "dryRun must be boolean");
  if (input.confirm !== undefined && typeof input.confirm !== "boolean") throw new WorkflowError(400, "confirm must be boolean");
  for (const [value, name] of [[input.name, "name"], [input.node, "node"], [input.ipfs, "ipfs"], [input.versionLabel, "versionLabel"]] as const) {
    if (value !== undefined && typeof value !== "string") throw new WorkflowError(400, `${name} must be a string`);
  }
  const gated = gateWorkflow(input.runId, input.candidateRef);
  const name = input.name ?? "lute/steak-honest";
  const node = input.node ?? process.env.GRAPH_NODE_ADMIN ?? "http://localhost:8020";
  const ipfs = input.ipfs ?? process.env.GRAPH_IPFS ?? "http://localhost:5001";
  const versionLabel = input.versionLabel ?? `lute-${gated.verifiedRun.runId}`;
  const plan = buildDeploymentPlan({
    graphCommand: process.env.GRAPH_COMMAND ?? "graph",
    node,
    ipfs,
    name,
    manifest: "subgraph.yaml",
    versionLabel,
  });
  const base: WorkflowDeployment = { schemaVersion: 1, dryRun: input.dryRun !== false, candidate: gated.candidate, verificationRunId: gated.verifiedRun.runId, gate: gated.gate, candidateRef: gated.candidateRef, plan };
  if (!gated.gate.allowed) return base;
  if (input.dryRun !== false) return base;
  if (input.confirm !== true) throw new WorkflowError(409, "deployment is an external state change; set confirm=true or use the default dry-run");
  if (process.env.LUTE_ENABLE_DEPLOYMENT !== "true") throw new WorkflowError(409, "deployment is disabled on this server; set LUTE_ENABLE_DEPLOYMENT=true for an explicitly authorized operator run");
  const results = await executeDeploymentPlan(plan, gated.candidate.root);
  const file = ensureInside(deploymentsRoot(), join(deploymentsRoot(), `${gated.verifiedRun.runId}-${Date.now()}.json`));
  const receipt = {
    schemaVersion: 1 as const,
    deployedAt: new Date().toISOString(),
    target: "graph-node" as const,
    name,
    node,
    ipfs,
    versionLabel,
    candidateHash: gated.candidate.candidateHash,
    verificationRunId: gated.verifiedRun.runId,
    steps: results.map(({ purpose, command, args, skipped }) => ({ purpose, command, args, skipped: skipped ?? false })),
    file,
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(receipt, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  return { ...base, dryRun: false, receipt, results };
}
