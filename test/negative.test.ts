// Negative tests: infrastructure failures must be INCONCLUSIVE (never VERIFIED),
// real disagreements must be FAILED, and non-exposed fields must be UNVERIFIED.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runAudit, decideVerdict } from "../src/audit.js";
import { runChecks } from "../src/reconcile.js";
import { BaseRpc } from "../src/rpc.js";
import { Logger } from "../src/logger.js";
import type { SubgraphSource } from "../src/subgraph/source.js";
import { SubgraphError } from "../src/subgraph/source.js";
import type { CanonicalEvent, IndexedEvent } from "../src/types.js";

const VAULT = "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183";
const quietLog = new Logger("test", false);

function fakeRpc(handler: (method: string, params: unknown[]) => unknown): BaseRpc {
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { method: string; params: unknown[] };
    const result = handler(body.method, body.params);
    if (result instanceof Error) {
      return new Response(JSON.stringify({ error: { code: -32000, message: result.message } }), { status: 200 });
    }
    return new Response(JSON.stringify({ result }), { status: 200 });
  }) as unknown as typeof fetch;
  return new BaseRpc({ url: "http://rpc", alias: "TEST_RPC", fetchImpl, maxRetries: 0 });
}

const okSource: SubgraphSource = {
  endpoint: "test://ok", entity: "e",
  async fetchEvents() {
    return { events: [], pageCount: 1, blockFilters: "" };
  },
};

test("one RPC chunk fails -> INCONCLUSIVE (never VERIFIED)", async () => {
  const rpc = fakeRpc((method) => {
    if (method === "eth_blockNumber") return "0x30f0000";
    if (method === "eth_getLogs") return new Error("server exploded");
    return null;
  });
  const r = await runAudit({ rpc, contract: VAULT, eventName: "Deposit", fromBlock: 100n, toBlock: 200n, subgraph: okSource, logger: quietLog });
  assert.equal(r.verdict, "INCONCLUSIVE");
  assert.match(r.inconclusiveReason ?? "", /RAW_RPC/);
  assert.notEqual(r.verdict, "VERIFIED");
});

test("Subgraph page fails -> INCONCLUSIVE", async () => {
  const rpc = fakeRpc((method) => {
    if (method === "eth_blockNumber") return "0x30f0000";
    if (method === "eth_getLogs") return [];
    if (method === "eth_getBlockByNumber") return { timestamp: "0x64" };
    return null;
  });
  const failingSource: SubgraphSource = {
    endpoint: "test://fail", entity: "e",
    async fetchEvents() {
      throw new SubgraphError("page 3 timed out", "page_failed");
    },
  };
  const r = await runAudit({ rpc, contract: VAULT, eventName: "Deposit", fromBlock: 100n, toBlock: 200n, subgraph: failingSource, logger: quietLog });
  assert.equal(r.verdict, "INCONCLUSIVE");
  assert.match(r.inconclusiveReason ?? "", /SUBGRAPH/);
});

test("range too close to head -> INCONCLUSIVE (reorg safety)", async () => {
  const HEAD = 0x30f0000; // 51_314_688
  const rpc = fakeRpc((method) => {
    if (method === "eth_blockNumber") return "0x" + HEAD.toString(16);
    if (method === "eth_getLogs") return [];
    if (method === "eth_getBlockByNumber") return { timestamp: "0x64" };
    return null;
  });
  const r = await runAudit({
    rpc, contract: VAULT, eventName: "Deposit",
    fromBlock: BigInt(HEAD - 100), toBlock: BigInt(HEAD - 10),
    subgraph: okSource, logger: quietLog, minConfirmations: 1000n,
  });
  assert.equal(r.verdict, "INCONCLUSIVE");
  assert.match(r.inconclusiveReason ?? "", /confirmations required|reorg/);
});

test("unsupported target -> INCONCLUSIVE (not VERIFIED)", async () => {
  const rpc = fakeRpc(() => null);
  const r = await runAudit({ rpc, contract: VAULT, eventName: "Rebase", fromBlock: 100n, toBlock: 200n, subgraph: okSource, logger: quietLog });
  assert.equal(r.verdict, "INCONCLUSIVE");
  assert.match(r.inconclusiveReason ?? "", /unsupported/);
});

// ---- check-level negatives ----
function raw(tx: string, li: number, block: string, assets: string): CanonicalEvent {
  return { network: "base", contract: VAULT, eventName: "Deposit", blockNumber: block, blockHash: "0x", transactionHash: tx, transactionIndex: 0, logIndex: li, fields: { sender: "0xa", owner: "0xa", assets, shares: "1" }, source: "RAW_RPC" };
}
function idx(tx: string, li: number, block: string, fields: Record<string, string>): IndexedEvent {
  return { entityId: `${tx}-${li}`, blockNumber: block, transactionHash: tx, logIndex: li, eventName: "Deposit", fields, source: "SUBGRAPH" };
}

test("field unavailable -> UNVERIFIED", () => {
  const checks = runChecks({ eventName: "Deposit", raw: [raw("0x1", 1, "10", "5")], indexed: [idx("0x1", 1, "10", { assets: "5", shares: "1" })] });
  assert.equal(checks.find((c) => c.name === "field_accuracy:sender")?.status, "UNVERIFIED");
  assert.equal(checks.find((c) => c.name === "field_accuracy:owner")?.status, "UNVERIFIED");
});

test("raw count differs -> FAILED", () => {
  const checks = runChecks({
    eventName: "Deposit",
    raw: [raw("0x1", 1, "10", "5"), raw("0x2", 2, "11", "6")],
    indexed: [idx("0x1", 1, "10", { assets: "5", shares: "1" })],
  });
  assert.equal(checks.find((c) => c.name === "event_count")?.status, "FAIL");
  assert.equal(decideVerdict(checks), "FAILED");
});

test("Subgraph duplicate -> FAILED", () => {
  const checks = runChecks({
    eventName: "Deposit",
    raw: [raw("0x1", 1, "10", "5")],
    indexed: [idx("0x1", 1, "10", { assets: "5", shares: "1" }), idx("0x1", 1, "10", { assets: "5", shares: "1" })],
  });
  assert.equal(checks.find((c) => c.name === "duplicate_detection")?.status, "FAIL");
  assert.equal(decideVerdict(checks), "FAILED");
});
