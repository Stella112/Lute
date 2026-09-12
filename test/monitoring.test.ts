import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadMonitoringTargets } from "../src/monitoring.js";

test("monitor configuration validates the operator watchlist", () => {
  const dir = mkdtempSync(join(tmpdir(), "lute-monitor-config-"));
  const file = join(dir, "watch.json");
  try {
    writeFileSync(file, JSON.stringify({ targets: [{ name: "honest", network: "base", contract: "0x" + "1".repeat(40), event: "Deposit", fromBlock: 1, toBlock: 2, subgraph: "graphnode:lute/steak-honest" }] }));
    const targets = loadMonitoringTargets(file);
    assert.equal(targets.length, 1);
    assert.equal(targets[0]?.fromBlock, "1");
    assert.equal(targets[0]?.subgraph, "graphnode:lute/steak-honest");

    writeFileSync(file, JSON.stringify({ targets: [{ name: "bad target", network: "base", contract: "0x" + "1".repeat(40), event: "Deposit", fromBlock: 1, toBlock: 2 }] }));
    assert.throws(() => loadMonitoringTargets(file), /invalid name/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
