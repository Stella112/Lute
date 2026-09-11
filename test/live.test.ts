// LIVE test — the required honest real-vault audit.
// Hits the real Base RPC and the real Morpho public index. Needs network access.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runAudit } from "../src/audit.js";
import { Logger } from "../src/logger.js";
import { resolveVerifierRpc } from "../src/rpc.js";
import { MorphoApiSource } from "../src/subgraph/morpho.js";

const VAULT = "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183"; // Steakhouse USDC (MetaMorpho / ERC-4626) on Base
const FROM = 51115000n;
const TO = 51125000n;

test("HONEST: RAW_RPC and Morpho index reconcile -> VERIFIED", { timeout: 120000 }, async () => {
  const logger = new Logger("live-honest", false);
  const rpc = resolveVerifierRpc(logger);
  const source = new MorphoApiSource(VAULT, rpc);
  const r = await runAudit({ rpc, contract: VAULT, eventName: "Deposit", fromBlock: FROM, toBlock: TO, subgraph: source, logger });

  assert.equal(r.verdict, "VERIFIED");
  assert.equal(r.firstDivergence, null);
  assert.ok(r.rawEvidence && r.subgraphEvidence);
  assert.equal(r.rawEvidence!.eventCount, r.subgraphEvidence!.recordCount);
  assert.ok(r.rawEvidence!.eventCount > 0);
  // the checks that CAN be performed against this index must have actually passed
  assert.equal(r.checks.find((c) => c.name === "event_count")?.status, "PASS");
  assert.equal(r.checks.find((c) => c.name === "field_accuracy:assets")?.status, "PASS");
  assert.equal(r.checks.find((c) => c.name === "field_accuracy:shares")?.status, "PASS");
});
