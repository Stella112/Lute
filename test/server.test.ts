import { test } from "node:test";
import assert from "node:assert/strict";

import { parseAuditRequest, server, validateBody } from "../src/server.js";
import { buildGraphProviderRequest } from "../src/graph-provider.js";

test("HTTP validation rejects unsafe and malformed audit requests", () => {
  assert.throws(() => validateBody({ contract: "bad", fromBlock: "1", toBlock: "2" }), /valid EVM address/);
  assert.throws(() => validateBody({ contract: "0x" + "1".repeat(40), fromBlock: "3", toBlock: "2" }), /greater than/);
});

test("audit requests accept query parameters for gateway body compatibility", () => {
  const url = new URL("http://127.0.0.1/api/audit?contract=0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183&event=Deposit&fromBlock=51115000&toBlock=51125000&subgraph=morpho");
  const expected = {
    contract: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183",
    event: "Deposit",
    fromBlock: "51115000",
    toBlock: "51125000",
    subgraph: "morpho",
  };
  assert.deepEqual(parseAuditRequest("", url), expected);
  assert.deepEqual(parseAuditRequest("not-json", url), expected);
  assert.throws(() => parseAuditRequest("not-json", new URL("http://127.0.0.1/api/audit")), /valid JSON/);
});

test("Graph provider adapter builds a bounded provider query", () => {
  const request = buildGraphProviderRequest({
    contract: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183",
    eventName: "Deposit",
    fromBlock: 51115000n,
    toBlock: 51125000n,
  });
  assert.match(request.endpoint, /^https:\/\/api\.studio\.thegraph\.com\//);
  assert.match(request.query, /depositEvents/);
  assert.match(request.query, /blockNumber_gte/);
  assert.deepEqual(request.variables, { lo: "51115000", hi: "51125000" });
});

test("Integrity Pack API is available without network access", async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/integrity-packs`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { packs: { id: string; version: string }[] };
    assert.deepEqual(body.packs[0], { id: "erc4626", version: "1", standard: "ERC-4626", supportedChains: ["base"], requiredSources: ["RAW_RPC", "SUBGRAPH"], events: ["Deposit", "Withdraw"], strongChecks: ["event_count", "duplicate_detection", "event_presence", "transaction_provenance", "block_provenance", "field_accuracy"], conditionalChecks: [], policies: { failClosed: true, requireFinalizedRange: true }, unsupportedClaims: ["APY", "arbitrary vault strategy accounting"] });
    const dashboard = await fetch(`http://127.0.0.1:${address.port}/v1/dashboard`);
    assert.equal(dashboard.status, 200);
    const dashboardBody = (await dashboard.json()) as { service: string; status: string; stats: { totalRuns: number }; packs: unknown[]; gate: unknown };
    assert.equal(dashboardBody.service, "lute");
    assert.equal(dashboardBody.status, "ok");
    assert.equal(typeof dashboardBody.stats.totalRuns, "number");
    assert.equal(dashboardBody.packs.length, 1);
    assert.ok("gate" in dashboardBody);
    assert.ok("incidents" in dashboardBody);
    assert.ok("monitoring" in dashboardBody);
    const incidents = await fetch(`http://127.0.0.1:${address.port}/v1/incidents`);
    assert.equal(incidents.status, 200);
    assert.deepEqual((await incidents.json()) as { incidents: unknown[] }, { incidents: [] });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
