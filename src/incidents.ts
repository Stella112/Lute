// Persisted incident lifecycle for monitoring failures.
//
// An incident is derived from a VerificationRun (or an isolated target error),
// never from caller-supplied text or a caller-supplied verdict. The repair context
// remains evidence and recommendations; it cannot alter the verifier or gate.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

import { createRepairContext, type RepairContext } from "./repair.js";
import { defaultRunsDir, type VerificationRun } from "./run-store.js";
import type { TargetSpec } from "./runner.js";
import type { Verdict } from "./types.js";

export type IncidentStatus = "OPEN" | "DIAGNOSED" | "REPAIR" | "REVERIFY" | "RESOLVED";
export type IncidentSeverity = "SEV-1" | "SEV-2" | "SEV-3";

export type IncidentTarget = {
  name: string;
  network: "base";
  contract: string;
  event: "Deposit" | "Withdraw";
  subgraph: string;
};

export type IntegrityIncident = {
  schemaVersion: 1;
  incidentId: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  title: string;
  target: IncidentTarget;
  verdict: Verdict;
  verificationRunId: string | null;
  monitorRunId: string | null;
  candidateHash: string | null;
  integrityPack: { id: string; version: string };
  firstDivergence: VerificationRun["report"]["firstDivergence"];
  violations: string[];
  evidenceRoot: string | null;
  repairContext: RepairContext | null;
  error: string | null;
  openedAt: string;
  updatedAt: string;
  resolution?: { reverificationRunId: string; resolvedAt: string };
};

function targetFor(target: TargetSpec): IncidentTarget {
  return {
    name: target.name,
    network: target.network ?? "base",
    contract: target.contract,
    event: target.event,
    subgraph: target.subgraph ?? "morpho",
  };
}

function shortError(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function incidentSeverity(verdict: Verdict, hasDivergence: boolean): IncidentSeverity {
  if (verdict === "FAILED" && hasDivergence) return "SEV-1";
  if (verdict === "FAILED") return "SEV-2";
  return "SEV-3";
}

export function createIncidentFromRun(run: VerificationRun, target: TargetSpec, monitorRunId: string | null = null): IntegrityIncident | null {
  if (run.verdict === "VERIFIED") return null;
  const now = run.createdAt;
  const divergence = run.report.firstDivergence;
  const violations = [...new Set(run.coverage.violations)];
  if (run.report.inconclusiveReason) violations.push(`inconclusive: ${shortError(run.report.inconclusiveReason)}`);
  return {
    schemaVersion: 1,
    incidentId: `incident-${run.runId}`,
    status: "OPEN",
    severity: incidentSeverity(run.verdict, !!divergence),
    title: divergence ? `Verification drift: ${divergence.check}` : run.verdict === "FAILED" ? "Verification failed" : "Verification inconclusive",
    target: targetFor(target),
    verdict: run.verdict,
    verificationRunId: run.runId,
    monitorRunId,
    candidateHash: run.candidateHash,
    integrityPack: run.integrityPack,
    firstDivergence: divergence,
    violations,
    evidenceRoot: run.evidenceRoot,
    repairContext: createRepairContext(run),
    error: null,
    openedAt: now,
    updatedAt: now,
  };
}

export function createIncidentFromError(target: TargetSpec, monitorRunId: string, error: string, now = new Date().toISOString()): IntegrityIncident {
  const targetInfo = targetFor(target);
  const suffix = createHash("sha256").update(`${monitorRunId}\0${targetInfo.name}`).digest("hex").slice(0, 16);
  const message = shortError(error) || "target execution failed";
  return {
    schemaVersion: 1,
    incidentId: `incident-${suffix}`,
    status: "OPEN",
    severity: "SEV-3",
    title: "Monitoring target unavailable",
    target: targetInfo,
    verdict: "INCONCLUSIVE",
    verificationRunId: null,
    monitorRunId,
    candidateHash: null,
    integrityPack: { id: "erc4626", version: "1" },
    firstDivergence: null,
    violations: [message],
    evidenceRoot: null,
    repairContext: null,
    error: message,
    openedAt: now,
    updatedAt: now,
  };
}

export function defaultIncidentsDir(): string {
  return process.env.LUTE_INCIDENTS_DIR ?? join(defaultRunsDir(), "..", "incidents");
}

export function saveIncident(incident: IntegrityIncident, filePath?: string): string {
  const output = filePath ?? join(defaultIncidentsDir(), `${incident.incidentId}.json`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(incident, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  return output;
}

export function resolveIncidentPath(value: string): string {
  if (isAbsolute(value) || value.includes("/") || value.includes("\\") || value.endsWith(".json")) return value;
  return join(defaultIncidentsDir(), `${value}.json`);
}

export function loadIncident(value: string): IntegrityIncident {
  const path = resolveIncidentPath(value);
  if (!existsSync(path)) throw new Error(`incident not found: ${path}`);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<IntegrityIncident>;
  if (parsed.schemaVersion !== 1 || typeof parsed.incidentId !== "string" || typeof parsed.status !== "string" || !parsed.target) {
    throw new Error(`invalid incident file: ${path}`);
  }
  return parsed as IntegrityIncident;
}

export function listIncidents(limit = 50): IntegrityIncident[] {
  const dir = defaultIncidentsDir();
  if (!existsSync(dir)) return [];
  const incidents: IntegrityIncident[] = [];
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith(".json"))) {
    try {
      incidents.push(loadIncident(join(dir, name)));
    } catch {
      // Ignore an interrupted or malformed file so the dashboard stays available.
    }
  }
  return incidents.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, Math.max(0, limit));
}

export function resolveMatchingIncidents(target: TargetSpec, reverificationRunId: string, resolvedAt = new Date().toISOString()): string[] {
  const expected = targetFor(target);
  const resolved: string[] = [];
  for (const incident of listIncidents(500)) {
    if (incident.status === "RESOLVED") continue;
    if (incident.target.name !== expected.name || incident.target.contract.toLowerCase() !== expected.contract.toLowerCase() || incident.target.event !== expected.event || incident.target.subgraph !== expected.subgraph) continue;
    const updated: IntegrityIncident = {
      ...incident,
      status: "RESOLVED",
      updatedAt: resolvedAt,
      resolution: { reverificationRunId, resolvedAt },
    };
    saveIncident(updated);
    resolved.push(updated.incidentId);
  }
  return resolved;
}
