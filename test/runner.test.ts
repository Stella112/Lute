// Batch runner tests: pure rollup logic (offline). The live watchlist batch is in
// runner.live.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";

import { rollup, verdictExitCode, type TargetResult } from "../src/runner.js";

const r = (name: string, verdict: TargetResult["verdict"]): TargetResult => ({ name, verdict, report: null });

test("rollup: all VERIFIED -> VERIFIED (exit 0)", () => {
  const { summary, verdict } = rollup([r("a", "VERIFIED"), r("b", "VERIFIED")]);
  assert.equal(verdict, "VERIFIED");
  assert.deepEqual(summary, { total: 2, verified: 2, failed: 0, inconclusive: 0 });
  assert.equal(verdictExitCode(verdict), 0);
});

test("rollup: any FAILED dominates (exit 2)", () => {
  const { verdict } = rollup([r("a", "VERIFIED"), r("b", "INCONCLUSIVE"), r("c", "FAILED")]);
  assert.equal(verdict, "FAILED");
  assert.equal(verdictExitCode(verdict), 2);
});

test("rollup: INCONCLUSIVE without FAILED (exit 3)", () => {
  const { verdict } = rollup([r("a", "VERIFIED"), r("b", "INCONCLUSIVE")]);
  assert.equal(verdict, "INCONCLUSIVE");
  assert.equal(verdictExitCode(verdict), 3);
});

test("rollup: empty batch -> VERIFIED with zero totals", () => {
  const { summary, verdict } = rollup([]);
  assert.equal(verdict, "VERIFIED");
  assert.deepEqual(summary, { total: 0, verified: 0, failed: 0, inconclusive: 0 });
});
