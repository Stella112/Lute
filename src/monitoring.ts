// Operator-configured monitoring orchestration.
//
// A monitoring run uses the unchanged batch verifier, persists every resulting
// VerificationRun, opens incidents for non-VERIFIED targets, and resolves matching
// open incidents only after a later VERIFIED result.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve as resolvePath } from "node:path";

import { buildCandidateManifest, type CandidateManifest } from "./candidate.js";
import { evidenceRoot } from "./evidence.js";
import { newRunId, Logger } from "./logger.js";
import {
  createIncidentFromError,
  createIncidentFromRun,
  resolveMatchingIncidents,
  saveIncident,
} from "./incidents.js";
import { createVerificationRun, defaultRunsDir, saveVerificationRun } from "./run-store.js";
import { runBatch, type BatchReport, type TargetSpec } from "./runner.js";
import type { BaseRpc } from "./rpc.js";

export type MonitoringRun = {
  schemaVersion: 1;
  monitorRunId: string;
  ranAt: string;
  batch: BatchReport;
  verificationRunIds: string[];
  incidentIds: string[];
  resultIncidentIds: (string | null)[];
  resolvedIncidentIds: string[];
};

export type MonitoringOptions = {
  rpc?: BaseRpc;
  logger?: Logger;
  webhookUrl?: string;
  fetchImpl?: typeof fetch;
  candidate?: CandidateManifest;
  candidateDir?: string;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL = /^\d+$/;

function parseTarget(value: unknown, index: number): TargetSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`monitor target ${index + 1} must be an object`);
  const raw = value as Record<string, unknown>;
  if (typeof raw.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(raw.name)) throw new Error(`monitor target ${index + 1} has an invalid name`);
  if (raw.network !== undefined && raw.network !== "base") throw new Error(`monitor target ${raw.name} must use network base`);
  if (typeof raw.contract !== "string" || !ADDRESS.test(raw.contract)) throw new Error(`monitor target ${raw.name} has an invalid contract`);
  if (raw.event !== "Deposit" && raw.event !== "Withdraw") throw new Error(`monitor target ${raw.name} must use Deposit or Withdraw`);
  if ((typeof raw.fromBlock !== "string" && typeof raw.fromBlock !== "number") || (typeof raw.toBlock !== "string" && typeof raw.toBlock !== "number")) throw new Error(`monitor target ${raw.name} must define fromBlock and toBlock`);
  const fromBlock = String(raw.fromBlock);
  const toBlock = String(raw.toBlock);
  if (!DECIMAL.test(fromBlock) || !DECIMAL.test(toBlock) || BigInt(toBlock) < BigInt(fromBlock)) throw new Error(`monitor target ${raw.name} has an invalid block range`);
  if (raw.subgraph !== undefined && (typeof raw.subgraph !== "string" || raw.subgraph.length === 0 || raw.subgraph.length > 256)) throw new Error(`monitor target ${raw.name} has an invalid subgraph`);
  return { name: raw.name, network: "base", contract: raw.contract, event: raw.event, fromBlock, toBlock, subgraph: raw.subgraph === undefined ? "morpho" : raw.subgraph };
}

export function loadMonitoringTargets(filePath = process.env.LUTE_MONITOR_CONFIG ?? "lute.monitor.example.json"): TargetSpec[] {
  const resolved = isAbsolute(filePath) ? filePath : resolvePath(filePath);
  if (!existsSync(resolved)) throw new Error(`monitor config not found: ${resolved}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    throw new Error(`monitor config is not valid JSON: ${resolved}`);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { targets?: unknown }).targets) || (parsed as { targets: unknown[] }).targets.length === 0) {
    throw new Error("monitor config must contain a non-empty targets array");
  }
  return (parsed as { targets: unknown[] }).targets.map(parseTarget);
}

function defaultMonitoringDir(): string {
  return process.env.LUTE_MONITORING_DIR ?? join(defaultRunsDir(), "..", "monitoring");
}

export function saveMonitoringRun(run: MonitoringRun, filePath?: string): string {
  const output = filePath ?? join(defaultMonitoringDir(), `${run.monitorRunId}.json`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(run, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  return output;
}

export function listMonitoringRuns(limit = 10): MonitoringRun[] {
  const dir = defaultMonitoringDir();
  if (!existsSync(dir)) return [];
  const runs: MonitoringRun[] = [];
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith(".json"))) {
    try {
      const run = JSON.parse(readFileSync(join(dir, name), "utf8")) as MonitoringRun;
      if (run.schemaVersion === 1 && typeof run.monitorRunId === "string" && run.batch) runs.push(run);
    } catch {
      // Ignore interrupted writes.
    }
  }
  return runs.sort((a, b) => Date.parse(b.ranAt) - Date.parse(a.ranAt)).slice(0, Math.max(0, limit));
}

export async function runMonitoring(targets: TargetSpec[], opts: MonitoringOptions = {}): Promise<MonitoringRun> {
  const monitorRunId = newRunId();
  const ranAt = new Date().toISOString();
  const batch = await runBatch(targets, {
    rpc: opts.rpc,
    logger: opts.logger ?? new Logger(monitorRunId),
    webhookUrl: opts.webhookUrl,
    fetchImpl: opts.fetchImpl,
  });
  const candidate = opts.candidate ?? buildCandidateManifest(opts.candidateDir ?? "subgraph");
  const verificationRunIds: string[] = [];
  const incidentIds: string[] = [];
  const resultIncidentIds: (string | null)[] = [];
  const resolvedIncidentIds: string[] = [];

  for (let index = 0; index < targets.length; index++) {
    const target = targets[index]!;
    const result = batch.results[index]!;
    if (result.report) {
      const run = createVerificationRun({ report: result.report, candidate, evidenceRoot: result.report.evidenceRoot ?? evidenceRoot(result.report) });
      saveVerificationRun(run);
      verificationRunIds.push(run.runId);
      if (run.verdict === "VERIFIED") {
        resultIncidentIds.push(null);
        resolvedIncidentIds.push(...resolveMatchingIncidents(target, run.runId));
      } else {
        const incident = createIncidentFromRun(run, target, monitorRunId);
        if (incident) {
          saveIncident(incident);
          incidentIds.push(incident.incidentId);
          resultIncidentIds.push(incident.incidentId);
        } else {
          resultIncidentIds.push(null);
        }
      }
    } else {
      const incident = createIncidentFromError(target, monitorRunId, result.error ?? "target did not return a report", ranAt);
      saveIncident(incident);
      incidentIds.push(incident.incidentId);
      resultIncidentIds.push(incident.incidentId);
    }
  }

  const monitor: MonitoringRun = { schemaVersion: 1, monitorRunId, ranAt, batch, verificationRunIds, incidentIds, resultIncidentIds, resolvedIncidentIds };
  saveMonitoringRun(monitor);
  return monitor;
}
