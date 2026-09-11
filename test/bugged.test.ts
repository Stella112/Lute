// CONTROLLED INTEGRATION test — the planted mapping bug must be caught by the SAME
// verifier that passed the honest case. Nothing about the bug (its block, tx, count)
// is asserted from prior knowledge beyond "exactly one event goes missing"; the block
// and tx are discovered by the divergence engine at runtime.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runAudit } from "../src/audit.js";
import { Logger } from "../src/logger.js";
import { resolveVerifierRpc } from "../src/rpc.js";
import { LocalMappingSource } from "../src/subgraph/localMapping.js";

const VAULT = "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183";
const FROM = 51115000n;
const TO = 51125000n;

test("the SAME audit passes a faithful mapping and fails the bugged one", { timeout: 180000 }, async () => {
  const logger = new Logger("bugged-int", false);
  const rpc = resolveVerifierRpc(logger);

  // faithful local mapping -> VERIFIED
  const honest = await runAudit({
    rpc, contract: VAULT, eventName: "Deposit", fromBlock: FROM, toBlock: TO,
    subgraph: new LocalMappingSource(VAULT, "Deposit", rpc, "none"), logger,
  });
  assert.equal(honest.verdict, "VERIFIED");

  // planted entity-id bug -> FAILED
  const bugged = await runAudit({
    rpc, contract: VAULT, eventName: "Deposit", fromBlock: FROM, toBlock: TO,
    subgraph: new LocalMappingSource(VAULT, "Deposit", rpc, "block-id"), logger,
  });
  assert.equal(bugged.verdict, "FAILED");

  // exactly one event lost
  assert.equal(bugged.rawEvidence!.eventCount - bugged.subgraphEvidence!.recordCount, 1);

  // first divergence discovered at runtime, inside the audited range, with evidence
  const d = bugged.firstDivergence;
  assert.ok(d, "first divergence must be located");
  assert.equal(d!.check, "event_presence");
  assert.equal(d!.event, "Deposit");
  assert.equal(d!.indexed, null); // the event is missing from the index
  assert.ok(d!.raw && d!.raw.assets, "raw side must carry the decoded event");
  assert.match(d!.transactionHash, /^0x[0-9a-f]{64}$/);
  const b = BigInt(d!.blockNumber);
  assert.ok(b >= FROM && b <= TO, "divergence block within audited range");
});

test("field-corruption bug is caught by field_accuracy", { timeout: 120000 }, async () => {
  const logger = new Logger("bugged-fields", false);
  const rpc = resolveVerifierRpc(logger);
  const r = await runAudit({
    rpc, contract: VAULT, eventName: "Deposit", fromBlock: FROM, toBlock: TO,
    subgraph: new LocalMappingSource(VAULT, "Deposit", rpc, "swap-fields"), logger,
  });
  assert.equal(r.verdict, "FAILED");
  assert.equal(r.checks.find((c) => c.name === "field_accuracy:assets")?.status, "FAIL");
});
