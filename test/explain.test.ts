// Deterministic NL generator tests (offline, fixture reports).

import { test } from "node:test";
import assert from "node:assert/strict";

import { explainReport, summarize } from "../src/explain.js";
import type { AuditReport } from "../src/types.js";

const base = {
  runId: "run-1",
  target: { type: "EXTERNAL_AUDIT" as const, network: "base" as const, contract: "0xVault", subgraph: "https://api.morpho.org/graphql (vaultV1Transactions)" },
  event: "Deposit",
  range: { startBlock: "100", endBlock: "200", safeHead: "9999" },
};

const verified: AuditReport = {
  ...base,
  verdict: "VERIFIED",
  checks: [
    { name: "event_count", class: "STRONG", status: "PASS" },
    { name: "field_accuracy:assets", class: "STRONG", status: "PASS" },
    { name: "field_accuracy:sender", class: "STRONG", status: "UNVERIFIED" },
  ],
  eventsChecked: 75,
  rawEvidence: { network: "base", contract: "0xVault", topic0: "0xdcbc", startBlock: "100", endBlock: "200", rpcAlias: "BASE_RPC_VERIFIER", chunkCount: 6, eventCount: 75 },
  subgraphEvidence: { endpoint: "https://api.morpho.org/graphql", entity: "vaultV1Transactions", blockFilters: "", pageCount: 1, recordCount: 75 },
  firstDivergence: null,
};

const failed: AuditReport = {
  ...base,
  verdict: "FAILED",
  checks: [
    { name: "event_count", class: "STRONG", status: "FAIL" },
    { name: "event_presence", class: "STRONG", status: "FAIL" },
    { name: "field_accuracy:assets", class: "STRONG", status: "PASS" },
  ],
  eventsChecked: 75,
  rawEvidence: { network: "base", contract: "0xVault", topic0: "0xdcbc", startBlock: "100", endBlock: "200", rpcAlias: "BASE_RPC_VERIFIER", chunkCount: 6, eventCount: 75 },
  subgraphEvidence: { endpoint: "local-mapping://block-id", entity: "VaultEvent (local mapping)", blockFilters: "", pageCount: 1, recordCount: 74 },
  firstDivergence: {
    blockNumber: "51120808", transactionHash: "0xabc", logIndex: 496, event: "Deposit", check: "event_presence",
    expectedSource: "RAW_RPC", observedSource: "SUBGRAPH", raw: { assets: "1398492" }, indexed: null,
  },
};

const inconclusive: AuditReport = {
  ...base, verdict: "INCONCLUSIVE", checks: [], eventsChecked: 0,
  rawEvidence: null, subgraphEvidence: null, firstDivergence: null,
  inconclusiveReason: "RAW_RPC read failed (chunk_failed): boom",
};

test("explain VERIFIED mentions counts, passing checks, and UNVERIFIED honesty", () => {
  const s = explainReport(verified);
  assert.match(s, /VERIFIED/);
  assert.match(s, /75 Deposit event/);
  assert.match(s, /same 75/);
  assert.match(s, /UNVERIFIED/);
  assert.match(s, /field_accuracy:sender/);
});

test("explain FAILED names the failed checks and the discovered first divergence", () => {
  const s = explainReport(failed);
  assert.match(s, /FAILED/);
  assert.match(s, /raw 75 .* index 74|75 .* but .* reported 74/);
  assert.match(s, /block 51120808/);
  assert.match(s, /log index 496/);
  assert.match(s, /discovered by range bisection/);
  assert.match(s, /missing from the index/);
});

test("explain INCONCLUSIVE never claims agreement", () => {
  const s = explainReport(inconclusive);
  assert.match(s, /INCONCLUSIVE/);
  assert.match(s, /never counts as agreement/);
  assert.doesNotMatch(s, /Audit .* — VERIFIED/); // must not assert a VERIFIED verdict
});

test("summarize one-liners", () => {
  assert.match(summarize(verified), /^VERIFIED: Deposit on 0xVault \[100-200\] — raw 75 == index 75$/);
  assert.match(summarize(failed), /^FAILED:.*first divergence block 51120808 \(event_presence\)$/);
  assert.match(summarize(inconclusive), /^INCONCLUSIVE:.*boom$/);
});
