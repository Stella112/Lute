// Batch runner tests: pure rollup logic (offline). The live watchlist batch is in
// runner.live.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";

import { rollup, verdictExitCode, postAlert, type TargetResult, type BatchReport } from "../src/runner.js";

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

function batch(results: TargetResult[]): BatchReport {
  const { summary, verdict } = rollup(results);
  return { runId: "r", ranAt: "now", summary, verdict, results };
}

test("postAlert: posts a Slack-style {text} payload for failing targets", async () => {
  let capturedUrl = "";
  let capturedBody = "";
  const fakeFetch = (async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedBody = init.body as string;
    return new Response("ok", { status: 200 });
  }) as unknown as typeof fetch;
  const b = batch([r("deposits", "VERIFIED"), r("bugged", "FAILED")]);
  const ok = await postAlert("https://hooks.slack.com/services/XXX", b, fakeFetch);
  assert.equal(ok, true);
  assert.match(capturedUrl, /slack/);
  const payload = JSON.parse(capturedBody);
  assert.ok("text" in payload && !("content" in payload));
  assert.match(payload.text, /Lute watch — FAILED/);
  assert.match(payload.text, /bugged: FAILED/);
});

test("postAlert: Discord URL gets {content}", async () => {
  let body = "";
  const fakeFetch = (async (_u: string, init: RequestInit) => { body = init.body as string; return new Response("", { status: 204 }); }) as unknown as typeof fetch;
  await postAlert("https://discord.com/api/webhooks/XXX", batch([r("x", "INCONCLUSIVE")]), fakeFetch);
  const payload = JSON.parse(body);
  assert.ok("content" in payload);
});

test("postAlert: clean batch does not post", async () => {
  let called = false;
  const fakeFetch = (async () => { called = true; return new Response("", { status: 200 }); }) as unknown as typeof fetch;
  const ok = await postAlert("https://hooks.slack.com/x", batch([r("a", "VERIFIED")]), fakeFetch);
  assert.equal(ok, false);
  assert.equal(called, false);
});
