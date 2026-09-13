import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildWorkflow, deployWorkflow, gateWorkflow, repairWorkflow } from "../src/control-plane.js";
import { evidenceRoot } from "../src/evidence.js";
import { createVerificationRun, saveVerificationRun } from "../src/run-store.js";
import type { AuditReport } from "../src/types.js";

const CONTRACT = "0x1234567890123456789012345678901234567890";

test("unified workflow creates an opaque build and keeps deployment dry-run", async () => {
  const root = mkdtempSync(join(tmpdir(), "lute-control-plane-"));
  const runs = join(root, "runs");
  const workflow = join(root, "workflows");
  const previousRuns = process.env.LUTE_RUNS_DIR;
  const previousWorkflow = process.env.LUTE_WORKFLOW_DIR;
  process.env.LUTE_RUNS_DIR = runs;
  process.env.LUTE_WORKFLOW_DIR = workflow;
  try {
    const build = await buildWorkflow({ intent: `Build an ERC-4626 indexer on Base for ${CONTRACT}`, startBlock: "123" });
    assert.match(build.buildId, /^[A-Za-z0-9_-]+$/);
    assert.match(build.result.candidate.candidateHash, /^[0-9a-f]{64}$/);

    const report: AuditReport = {
      runId: "control-plane-run",
      target: { type: "EXTERNAL_AUDIT", network: "base", contract: CONTRACT, subgraph: "test" },
      event: "Deposit",
      range: { startBlock: "123", endBlock: "456", safeHead: "456" },
      verdict: "FAILED",
      checks: [{ name: "event_presence", class: "STRONG", status: "FAIL", detail: "test failure" }],
      eventsChecked: 1,
      rawEvidence: { network: "base", contract: CONTRACT, topic0: "0x", startBlock: "123", endBlock: "456", rpcAlias: "test", chunkCount: 1, eventCount: 1 },
      subgraphEvidence: { endpoint: "test", entity: "DepositEvent", blockFilters: "123-456", pageCount: 1, recordCount: 0 },
      firstDivergence: null,
    };
    const run = createVerificationRun({ report, candidate: build.result.candidate, evidenceRoot: evidenceRoot(report) });
    saveVerificationRun(run);

    const context = repairWorkflow(run.runId, build.buildId);
    assert.deepEqual(context.context.failedChecks, ["event_presence"]);
    const preview = await deployWorkflow({ runId: run.runId, candidateRef: build.buildId });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.gate.allowed, false);
    assert.equal(preview.gate.state, "BLOCKED");
    assert.equal(preview.plan.length, 4);
    assert.throws(() => gateWorkflow("../outside"), /persisted verification id/);
  } finally {
    if (previousRuns === undefined) delete process.env.LUTE_RUNS_DIR; else process.env.LUTE_RUNS_DIR = previousRuns;
    if (previousWorkflow === undefined) delete process.env.LUTE_WORKFLOW_DIR; else process.env.LUTE_WORKFLOW_DIR = previousWorkflow;
    rmSync(root, { recursive: true, force: true });
  }
});
