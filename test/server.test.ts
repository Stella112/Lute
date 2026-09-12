import { test } from "node:test";
import assert from "node:assert/strict";

import { server, validateBody } from "../src/server.js";

test("HTTP validation rejects unsafe and malformed audit requests", () => {
  assert.throws(() => validateBody({ contract: "bad", fromBlock: "1", toBlock: "2" }), /valid EVM address/);
  assert.throws(() => validateBody({ contract: "0x" + "1".repeat(40), fromBlock: "3", toBlock: "2" }), /greater than/);
});

test("Integrity Pack API is available without network access", async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/integrity-packs`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { packs: { id: string; version: string }[] };
    assert.deepEqual(body.packs[0], { id: "erc4626", version: "1", standard: "ERC-4626", supportedChains: ["base"], requiredSources: ["RAW_RPC", "SUBGRAPH"], strongChecks: ["event_count", "duplicate_detection", "event_presence", "transaction_provenance", "block_provenance", "field_accuracy"], unsupportedClaims: ["APY", "arbitrary vault strategy accounting"] });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
