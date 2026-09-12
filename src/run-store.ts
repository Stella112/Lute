import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

import type { CandidateManifest } from "./candidate.js";
import { evidenceRoot } from "./evidence.js";
import type { AuditReport, CheckResult, Verdict } from "./types.js";

export type VerificationCoverage = {
  strongChecksPassed: number;
  strongChecksTotal: number;
  conditionalChecksPassed: number;
  conditionalChecksTotal: number;
  unverifiedFields: string[];
  violations: string[];
  eventsChecked: number;
  blocksChecked: string;
  sourcesComplete: boolean;
};

export type VerificationRun = {
  schemaVersion: 1;
  runId: string;
  candidateHash: string;
  candidate: CandidateManifest;
  verifierVersion: string;
  verifierCommit: string;
  integrityPack: { id: string; version: string };
  report: AuditReport;
  coverage: VerificationCoverage;
  evidenceRoot: string;
  verdict: Verdict;
  createdAt: string;
  revoked: boolean;
};

export function coverageFor(report: AuditReport): VerificationCoverage {
  const strong = report.checks.filter((c) => c.class === "STRONG");
  const conditional = report.checks.filter((c) => c.class !== "STRONG");
  const unverifiedFields = report.checks
    .filter((c) => c.status === "UNVERIFIED" && c.name.startsWith("field_accuracy:"))
    .map((c) => c.name.slice("field_accuracy:".length));
  const violations = report.checks.filter((c) => c.status === "FAIL").map((c) => c.name);
  return {
    strongChecksPassed: strong.filter((c) => c.status === "PASS").length,
    strongChecksTotal: strong.length,
    conditionalChecksPassed: conditional.filter((c) => c.status === "PASS").length,
    conditionalChecksTotal: conditional.length,
    unverifiedFields,
    violations,
    eventsChecked: report.eventsChecked,
    blocksChecked: `${report.range.startBlock}-${report.range.endBlock}`,
    sourcesComplete: report.verdict !== "INCONCLUSIVE" && !!report.rawEvidence && !!report.subgraphEvidence,
  };
}

export function createVerificationRun(args: {
  report: AuditReport;
  candidate: CandidateManifest;
  evidenceRoot: string;
  verifierVersion?: string;
  verifierCommit?: string;
  integrityPack?: { id: string; version: string };
}): VerificationRun {
  return {
    schemaVersion: 1,
    runId: args.report.runId,
    candidateHash: args.candidate.candidateHash,
    candidate: args.candidate,
    verifierVersion: args.verifierVersion ?? "lute@0.1.0",
    verifierCommit: args.verifierCommit ?? process.env.LUTE_VERIFIER_COMMIT ?? "unknown",
    integrityPack: args.integrityPack ?? { id: "erc4626", version: "1" },
    report: args.report,
    coverage: coverageFor(args.report),
    evidenceRoot: args.evidenceRoot,
    verdict: args.report.verdict,
    createdAt: new Date().toISOString(),
    revoked: false,
  };
}

export function defaultRunsDir(): string {
  return process.env.LUTE_RUNS_DIR ?? ".lute/runs";
}

export function saveVerificationRun(run: VerificationRun, filePath?: string): string {
  const output = filePath ?? join(defaultRunsDir(), `${run.runId}.json`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(run, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  return output;
}

export function resolveRunPath(value: string): string {
  if (isAbsolute(value) || value.includes("/") || value.includes("\\") || value.endsWith(".json")) return value;
  return join(defaultRunsDir(), `${value}.json`);
}

export function loadVerificationRun(value: string): VerificationRun {
  const path = resolveRunPath(value);
  if (!existsSync(path)) throw new Error(`verification run not found: ${path}`);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<VerificationRun>;
  if (parsed.schemaVersion !== 1 || typeof parsed.runId !== "string" || typeof parsed.candidateHash !== "string" || !parsed.report || !parsed.candidate) {
    throw new Error(`invalid VerificationRun file: ${path}`);
  }
  const run = parsed as VerificationRun;
  if (run.report.runId !== run.runId || run.candidate.candidateHash !== run.candidateHash) {
    throw new Error(`invalid VerificationRun binding: ${path}`);
  }
  if (run.evidenceRoot && run.evidenceRoot !== evidenceRoot(run.report)) {
    throw new Error(`invalid VerificationRun evidence root: ${path}`);
  }
  return run;
}

/** Load the newest persisted runs for dashboard/API consumers. Invalid files are ignored so
 * one interrupted write cannot take the whole dashboard offline. */
export function listVerificationRuns(limit = 25): VerificationRun[] {
  const dir = defaultRunsDir();
  if (!existsSync(dir)) return [];
  const paths = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(dir, name));
  const runs: VerificationRun[] = [];
  for (const path of paths) {
    try {
      runs.push(loadVerificationRun(path));
    } catch {
      // Ignore malformed or partially-written historical files.
    }
  }
  return runs
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, Math.max(0, limit));
}

export function freshnessFor(run: VerificationRun): boolean | undefined {
  const configured = process.env.LUTE_MAX_VERIFICATION_AGE_SECONDS;
  if (configured === undefined) return undefined;
  if (!/^\d+$/.test(configured)) throw new Error("LUTE_MAX_VERIFICATION_AGE_SECONDS must be a non-negative integer");
  const created = Date.parse(run.createdAt);
  if (!Number.isFinite(created)) return false;
  return Date.now() - created <= Number(configured) * 1000;
}

export function requiredStrongChecksPassed(checks: CheckResult[]): boolean {
  const strong = checks.filter((c) => c.class === "STRONG");
  return strong.length > 0 && strong.every((c) => c.status === "PASS");
}
