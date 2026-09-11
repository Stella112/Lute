// LIVE: run a watchlist batch against real Base data and assert the rollup.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runBatch, type TargetSpec } from "../src/runner.js";
import { Logger } from "../src/logger.js";
import { resolveVerifierRpc } from "../src/rpc.js";

const VAULT = "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183";

test("watchlist batch rolls up honest + bugged targets", { timeout: 240000 }, async () => {
  const targets: TargetSpec[] = [
    { name: "deposits", contract: VAULT, event: "Deposit", fromBlock: 51115000, toBlock: 51125000, subgraph: "morpho" },
    { name: "withdraws", contract: VAULT, event: "Withdraw", fromBlock: 51100000, toBlock: 51110000, subgraph: "morpho" },
    { name: "bugged", contract: VAULT, event: "Deposit", fromBlock: 51115000, toBlock: 51125000, subgraph: "local:block-id" },
  ];
  const logger = new Logger("batch-live", false);
  const batch = await runBatch(targets, { rpc: resolveVerifierRpc(logger), logger });

  assert.equal(batch.results.find((x) => x.name === "deposits")?.verdict, "VERIFIED");
  assert.equal(batch.results.find((x) => x.name === "withdraws")?.verdict, "VERIFIED");
  const bugged = batch.results.find((x) => x.name === "bugged");
  assert.equal(bugged?.verdict, "FAILED");
  assert.ok(bugged?.report?.firstDivergence, "bugged target must carry a first divergence");
  assert.equal(batch.summary.verified, 2);
  assert.equal(batch.summary.failed, 1);
  assert.equal(batch.verdict, "FAILED"); // one bad target fails the whole batch
});
