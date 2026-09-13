import { test } from "node:test";
import assert from "node:assert/strict";

import { createIntegrityPackArtifact, loadErc4626Pack } from "../src/integrity-pack.js";
import { createVerificationRun } from "../src/run-store.js";
import { evidenceRoot } from "../src/evidence.js";
import type { CandidateManifest } from "../src/candidate.js";
import type { AuditReport } from "../src/types.js";

const report: AuditReport = {
  runId: "pack-run",
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

const candidate: CandidateManifest = {
  root: "subgraph",
  files: [{ path: "subgraph.yaml", sha256: "a".repeat(64), bytes: 1 }],
  fileCount: 1,
  candidateHash: "b".repeat(64),
};

test("loads the reviewed ERC-4626 pack definition", () => {
  const pack = loadErc4626Pack();
  assert.equal(pack.id, "erc4626");
  assert.equal(pack.version, "1");
  assert.deepEqual(pack.policies, { failClosed: true, requireFinalizedRange: true });
  assert.deepEqual(pack.events, ["Deposit", "Withdraw"]);
  assert.deepEqual(pack.conditionalChecks, []);
});

test("creates a portable trust manifest with stable evidence lineage", () => {
  const run = createVerificationRun({ report, candidate, evidenceRoot: evidenceRoot(report) });
  const artifact = createIntegrityPackArtifact(run, {
    protocol: "x402",
    facilitator: "https://facilitator.example",
    network: "hedera:testnet",
    transaction: "0.0.1@1.2.3",
    payer: "0.0.2",
    payTo: "0.0.3",
    amount: "100000000",
    asset: "0.0.0",
  });

  assert.equal(artifact.schemaVersion, 1);
  assert.equal(artifact.trustManifest.evidenceRoot, run.evidenceRoot);
  assert.equal(artifact.trustManifest.candidateHash, run.candidateHash);
  assert.equal(artifact.trustManifest.verdict, "VERIFIED");
  assert.equal(artifact.candidate.hash, run.candidateHash);
  assert.ok(artifact.evidence.lineage.some((node) => node.id === "pack-run:source:raw-rpc"));
  assert.ok(artifact.evidence.lineage.some((node) => node.id === "pack-run:check:event_count"));
  assert.equal(artifact.payment?.amount, "100000000");
});
