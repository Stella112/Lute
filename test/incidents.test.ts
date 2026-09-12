import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createIncidentFromRun, listIncidents, resolveMatchingIncidents, saveIncident } from "../src/incidents.js";
import { evidenceRoot } from "../src/evidence.js";
import { createVerificationRun } from "../src/run-store.js";
import type { CandidateManifest } from "../src/candidate.js";
import type { TargetSpec } from "../src/runner.js";
import type { AuditReport } from "../src/types.js";

const target: TargetSpec = {
  name: "test-target",
  network: "base",
  contract: "0x" + "1".repeat(40),
  event: "Deposit",
  fromBlock: "1",
  toBlock: "2",
  subgraph: "graphnode:lute/test",
};

const candidate: CandidateManifest = {
  root: "subgraph",
  files: [{ path: "src/mapping.ts", sha256: "a".repeat(64), bytes: 1 }],
  fileCount: 1,
  candidateHash: "b".repeat(64),
};

const report: AuditReport = {
  runId: "failed-run",
  target: { type: "EXTERNAL_AUDIT", network: "base", contract: target.contract, subgraph: target.subgraph! },
  event: "Deposit",
  range: { startBlock: "1", endBlock: "2", safeHead: "3" },
  verdict: "FAILED",
  checks: [{ name: "event_presence", class: "STRONG", status: "FAIL", detail: "missing_from_index=1" }],
  eventsChecked: 2,
  rawEvidence: { network: "base", contract: target.contract, topic0: "0x", startBlock: "1", endBlock: "2", rpcAlias: "test", chunkCount: 1, eventCount: 2 },
  subgraphEvidence: { endpoint: "test", entity: "depositEvents", blockFilters: "", pageCount: 1, recordCount: 1 },
  firstDivergence: { blockNumber: "2", transactionHash: "0x" + "2".repeat(64), logIndex: 0, event: "Deposit", check: "event_presence", expectedSource: "RAW_RPC", observedSource: "SUBGRAPH", raw: null, indexed: null },
};

test("failed monitoring results persist repair-ready incidents and later verification resolves them", () => {
  const runsDir = mkdtempSync(join(tmpdir(), "lute-incident-runs-"));
  const incidentsDir = mkdtempSync(join(tmpdir(), "lute-incidents-"));
  const previousRuns = process.env.LUTE_RUNS_DIR;
  const previousIncidents = process.env.LUTE_INCIDENTS_DIR;
  process.env.LUTE_RUNS_DIR = runsDir;
  process.env.LUTE_INCIDENTS_DIR = incidentsDir;
  try {
    const run = createVerificationRun({ report, candidate, evidenceRoot: evidenceRoot(report) });
    const incident = createIncidentFromRun(run, target, "monitor-1");
    assert.ok(incident);
    assert.equal(incident.severity, "SEV-1");
    assert.equal(incident.repairContext?.failedChecks[0], "event_presence");
    saveIncident(incident);
    assert.equal(listIncidents()[0]?.incidentId, "incident-failed-run");

    const verifiedReport: AuditReport = { ...report, runId: "verified-run", verdict: "VERIFIED", checks: [{ name: "event_presence", class: "STRONG", status: "PASS" }], firstDivergence: null };
    const verifiedRun = createVerificationRun({ report: verifiedReport, candidate, evidenceRoot: evidenceRoot(verifiedReport) });
    assert.deepEqual(resolveMatchingIncidents(target, verifiedRun.runId), ["incident-failed-run"]);
    assert.equal(listIncidents()[0]?.status, "RESOLVED");
    assert.equal(listIncidents()[0]?.resolution?.reverificationRunId, "verified-run");
  } finally {
    if (previousRuns === undefined) delete process.env.LUTE_RUNS_DIR;
    else process.env.LUTE_RUNS_DIR = previousRuns;
    if (previousIncidents === undefined) delete process.env.LUTE_INCIDENTS_DIR;
    else process.env.LUTE_INCIDENTS_DIR = previousIncidents;
    rmSync(runsDir, { recursive: true, force: true });
    rmSync(incidentsDir, { recursive: true, force: true });
  }
});
