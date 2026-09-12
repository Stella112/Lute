import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evidenceRoot } from "../src/evidence.js";
import { createVerificationRun, loadVerificationRun, saveVerificationRun } from "../src/run-store.js";
import type { AuditReport } from "../src/types.js";
import type { CandidateManifest } from "../src/candidate.js";

const candidate: CandidateManifest = {
  root: "subgraph",
  files: [{ path: "subgraph.yaml", sha256: "a".repeat(64), bytes: 1 }],
  fileCount: 1,
  candidateHash: "b".repeat(64),
};

const report: AuditReport = {
  runId: "run-test",
  target: { type: "EXTERNAL_AUDIT", network: "base", contract: "0x" + "1".repeat(40), subgraph: "test" },
  event: "Deposit",
  range: { startBlock: "1", endBlock: "2", safeHead: "3" },
  verdict: "VERIFIED",
  checks: [
    { name: "event_count", class: "STRONG", status: "PASS" },
    { name: "field_accuracy:assets", class: "STRONG", status: "PASS" },
  ],
  eventsChecked: 1,
  rawEvidence: { network: "base", contract: "0x" + "1".repeat(40), topic0: "0x", startBlock: "1", endBlock: "2", rpcAlias: "test", chunkCount: 1, eventCount: 1 },
  subgraphEvidence: { endpoint: "test", entity: "deposits", blockFilters: "", pageCount: 1, recordCount: 1 },
  firstDivergence: null,
};

test("evidence root is deterministic", () => {
  assert.equal(evidenceRoot(report), evidenceRoot({ ...report }));
  const withUndefinedOptionalFields = { ...report, checks: [{ ...report.checks[0]!, expected: undefined, observed: undefined }] };
  assert.equal(evidenceRoot(withUndefinedOptionalFields), evidenceRoot(JSON.parse(JSON.stringify(withUndefinedOptionalFields))));
});

test("VerificationRun persists candidate binding and coverage", () => {
  const dir = mkdtempSync(join(tmpdir(), "lute-runs-"));
  try {
    const run = createVerificationRun({ report, candidate, evidenceRoot: evidenceRoot(report) });
    const file = saveVerificationRun(run, join(dir, "run.json"));
    const loaded = loadVerificationRun(file);
    assert.equal(loaded.candidateHash, candidate.candidateHash);
    assert.equal(loaded.coverage.strongChecksPassed, 2);
    assert.equal(loaded.coverage.sourcesComplete, true);
    assert.equal(loaded.verdict, "VERIFIED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
