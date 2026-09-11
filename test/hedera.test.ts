// Hedera attestation: offline test of the pure payload builder + config gate.
// The live HCS submit (publishAttestation) needs testnet credentials and is exercised
// separately.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAttestation, isHederaConfigured } from "../src/hedera.js";
import type { AuditReport } from "../src/types.js";

const failed: AuditReport = {
  runId: "run-9",
  target: { type: "EXTERNAL_AUDIT", network: "base", contract: "0xVault", subgraph: "graphnode" },
  event: "Deposit",
  range: { startBlock: "51115000", endBlock: "51121000", safeHead: "51169000" },
  verdict: "FAILED",
  checks: [],
  eventsChecked: 49,
  rawEvidence: { network: "base", contract: "0xVault", topic0: "0xdcbc", startBlock: "51115000", endBlock: "51121000", rpcAlias: "BASE_RPC_VERIFIER", chunkCount: 3, eventCount: 49 },
  subgraphEvidence: { endpoint: "graph-node", entity: "depositEvents", blockFilters: "", pageCount: 1, recordCount: 48 },
  firstDivergence: { blockNumber: "51120808", transactionHash: "0xabc", logIndex: 496, event: "Deposit", check: "event_presence", expectedSource: "RAW_RPC", observedSource: "SUBGRAPH", raw: { assets: "1" }, indexed: null },
};

test("buildAttestation reduces a report to a compact, faithful payload", () => {
  const a = buildAttestation(failed, () => "2026-01-01T00:00:00.000Z");
  assert.equal(a.app, "lute");
  assert.equal(a.kind, "reconciliation-audit");
  assert.equal(a.verdict, "FAILED");
  assert.equal(a.contract, "0xVault");
  assert.equal(a.counts.raw, 49);
  assert.equal(a.counts.subgraph, 48);
  assert.equal(a.firstDivergence?.blockNumber, "51120808");
  assert.equal(a.firstDivergence?.logIndex, 496);
  assert.equal(a.runId, "run-9");
  assert.equal(a.ts, "2026-01-01T00:00:00.000Z");
  // stays comfortably within a single HCS message
  assert.ok(JSON.stringify(a).length < 1000);
});

test("isHederaConfigured rejects the placeholder key", () => {
  assert.equal(isHederaConfigured({ operatorId: "0.0.1", operatorKey: "PASTE_YOUR_HEX_ENCODED_PRIVATE_KEY_HERE" }), false);
  assert.equal(isHederaConfigured({ operatorId: "0.0.1", operatorKey: "0xabc123" }), true);
  assert.equal(isHederaConfigured({ operatorId: undefined, operatorKey: "0xabc" }), false);
});
