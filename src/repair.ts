// Deterministic Repair workflow (contract §29).
//
// RepairContext is evidence, not a verdict. It gives a coding agent the exact failed
// checks and observations while keeping the verifier, pack, and expected-value path
// outside the candidate's control. Applying the built-in fix is opt-in and narrow.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { VerificationRun } from "./run-store.js";

export type RepairContext = {
  schemaVersion: 1;
  workflow: "REPAIR";
  runId: string;
  candidateHash: string;
  pack: VerificationRun["integrityPack"];
  failedChecks: string[];
  firstDivergence: VerificationRun["report"]["firstDivergence"];
  canonicalObservation: Record<string, string> | null;
  indexedObservation: Record<string, string> | null;
  evidenceIds: string[];
  relevantFiles: string[];
  limitations: string[];
  recommendedActions: string[];
};

export function createRepairContext(run: VerificationRun): RepairContext {
  const failedChecks = run.report.checks.filter((check) => check.status === "FAIL").map((check) => check.name);
  const files = run.candidate.files.map((file) => file.path);
  const relevantFiles = files.filter((file) =>
    /(^|\/)(subgraph\.ya?ml|schema\.graphql|src\/.*mapping\.(ts|rs)|abis\/.*\.json)$/.test(file),
  );
  const divergence = run.report.firstDivergence;
  return {
    schemaVersion: 1,
    workflow: "REPAIR",
    runId: run.runId,
    candidateHash: run.candidateHash,
    pack: run.integrityPack,
    failedChecks,
    firstDivergence: divergence,
    canonicalObservation: divergence?.raw ?? null,
    indexedObservation: divergence?.indexed ?? null,
    evidenceIds: [
      `${run.runId}:evidence-root:${run.evidenceRoot}`,
      ...failedChecks.map((check) => `${run.runId}:check:${check}`),
    ],
    relevantFiles,
    limitations: [
      "The verifier and Integrity Pack are immutable repair inputs.",
      "Expected values must remain derived from RAW_RPC; candidate output cannot update them.",
      "A repaired candidate requires a new candidate hash and a mandatory new VerificationRun.",
      "Deployment remains blocked until the unchanged verifier returns VERIFIED and the gate allows the exact hash.",
    ],
    recommendedActions: failedChecks.length
      ? ["Patch only the relevant candidate files.", "Rebuild/codegen the candidate.", "Create a fresh VerificationRun with the unchanged verifier.", "Re-evaluate the deployment gate."]
      : ["No failed checks are present; do not change the candidate solely to create a repair.", "Re-run verification if the source range or deployment changed."],
  };
}

/**
 * Apply the intentionally narrow ERC-4626 entity-id repair. It only changes the
 * known non-unique block-number idiom and returns false for any other candidate.
 */
export function applyKnownErc4626Repair(candidateDir: string): { changed: boolean; file: string } {
  const file = join(candidateDir, "src", "mapping.ts");
  if (!existsSync(file)) return { changed: false, file };
  const before = readFileSync(file, "utf8");
  const after = before.replaceAll(
    "let id = event.block.number.toString();",
    'let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();',
  );
  if (after === before) return { changed: false, file };
  writeFileSync(file, after);
  return { changed: true, file };
}
