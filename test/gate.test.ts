// Deployment Gate tests (contract §26 acceptance). Pure, deterministic, fail-closed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decideGate, type GateInput } from "../src/gate.js";

const H = "a".repeat(64);
const H2 = "b".repeat(64);
const base: GateInput = {
  verdict: "VERIFIED",
  candidateHash: H,
  verifiedCandidateHash: H,
  requiredStrongChecksPassed: true,
  sourcesComplete: true,
  freshnessOk: true,
};

test("ALLOWED only when verified hash matches and all policy checks pass", () => {
  const d = decideGate(base);
  assert.equal(d.state, "ALLOWED");
  assert.equal(d.allowed, true);
});

test("FAILED verdict -> BLOCKED", () => {
  assert.equal(decideGate({ ...base, verdict: "FAILED" }).state, "BLOCKED");
});

test("never verified -> BLOCKED", () => {
  assert.equal(decideGate({ ...base, verifiedCandidateHash: null }).state, "BLOCKED");
});

test("required strong checks not all passed -> BLOCKED", () => {
  assert.equal(decideGate({ ...base, requiredStrongChecksPassed: false }).state, "BLOCKED");
});

test("candidate hash != verified hash (verify A, deploy B) -> STALE, not ALLOWED", () => {
  const d = decideGate({ ...base, candidateHash: H2 });
  assert.equal(d.state, "STALE");
  assert.equal(d.allowed, false);
});

test("stale freshness -> STALE", () => {
  assert.equal(decideGate({ ...base, freshnessOk: false }).state, "STALE");
});

test("INCONCLUSIVE verdict -> INCOMPLETE (never ALLOWED)", () => {
  const d = decideGate({ ...base, verdict: "INCONCLUSIVE" });
  assert.equal(d.state, "INCOMPLETE");
  assert.equal(d.allowed, false);
});

test("incomplete sources -> INCOMPLETE even if verdict VERIFIED", () => {
  assert.equal(decideGate({ ...base, sourcesComplete: false }).state, "INCOMPLETE");
});

test("revoked -> REVOKED dominates", () => {
  assert.equal(decideGate({ ...base, revoked: true }).state, "REVOKED");
});
