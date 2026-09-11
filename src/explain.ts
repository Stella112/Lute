// Deterministic natural-language generator.
//
// Turns an AuditReport into plain English. It is a pure function of the report's own
// fields — no model call, no randomness, no fabrication. Every sentence is backed by a
// value that came from execution, so the prose is exactly as trustworthy as the report.

import type { AuditReport, CheckResult } from "./types.js";

const byStatus = (checks: CheckResult[], s: CheckResult["status"]) =>
  checks.filter((c) => c.status === s).map((c) => c.name);

function list(names: string[]): string {
  if (names.length === 0) return "none";
  if (names.length === 1) return names[0]!;
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

/** One-line summary suitable for an alert / log line. */
export function summarize(r: AuditReport): string {
  const where = `${r.event} on ${r.target.contract} [${r.range.startBlock}-${r.range.endBlock}]`;
  if (r.verdict === "VERIFIED") {
    return `VERIFIED: ${where} — raw ${r.rawEvidence?.eventCount} == index ${r.subgraphEvidence?.recordCount}`;
  }
  if (r.verdict === "FAILED") {
    const d = r.firstDivergence;
    const div = d ? `, first divergence block ${d.blockNumber} (${d.check})` : "";
    return `FAILED: ${where} — raw ${r.rawEvidence?.eventCount} vs index ${r.subgraphEvidence?.recordCount}${div}`;
  }
  return `INCONCLUSIVE: ${where} — ${r.inconclusiveReason ?? "comparison could not complete"}`;
}

/** Full multi-sentence explanation. */
export function explainReport(r: AuditReport): string {
  const idx = r.target.subgraph;
  const range = `Base blocks ${r.range.startBlock}–${r.range.endBlock}`;

  if (r.verdict === "INCONCLUSIVE") {
    return (
      `Audit ${r.runId} — INCONCLUSIVE.\n\n` +
      `The reconciliation over ${range} could not be completed reliably: ${r.inconclusiveReason ?? "a required data source was unavailable or malformed"}. ` +
      `An infrastructure failure never counts as agreement, so Lute reports INCONCLUSIVE rather than VERIFIED. ` +
      `Resolve the data-source issue and re-run.`
    );
  }

  const passed = byStatus(r.checks, "PASS");
  const failed = byStatus(r.checks, "FAIL");
  const unverified = byStatus(r.checks, "UNVERIFIED");
  const rawN = r.rawEvidence?.eventCount ?? 0;
  const subN = r.subgraphEvidence?.recordCount ?? 0;

  const unverifiedNote =
    unverified.length > 0
      ? ` ${unverified.length} check(s) — ${list(unverified)} — could not be performed because the index does not expose those fields; they were left UNVERIFIED rather than assumed.`
      : "";

  if (r.verdict === "VERIFIED") {
    return (
      `Audit ${r.runId} — VERIFIED.\n\n` +
      `Over ${range}, Lute independently reconstructed ${rawN} ${r.event} event(s) directly from raw RPC logs ` +
      `(topic0 ${r.rawEvidence?.topic0}, ${r.rawEvidence?.chunkCount} chunk(s) via ${r.rawEvidence?.rpcAlias}) and found that ${idx} reported exactly the same ${subN}. ` +
      `Every independently verifiable check passed: ${list(passed)}.` +
      unverifiedNote +
      ` No divergence was found — the index faithfully reflects the chain over this range.`
    );
  }

  // FAILED
  const d = r.firstDivergence;
  let divPara: string;
  if (d) {
    const rawSide = d.raw ? `raw fields ${JSON.stringify(d.raw)}` : "present on-chain";
    const idxSide = d.indexed ? `index fields ${JSON.stringify(d.indexed)}` : "missing from the index";
    divPara =
      `The earliest divergence is at block ${d.blockNumber}, transaction ${d.transactionHash}, log index ${d.logIndex}. ` +
      `That ${d.event} event is ${rawSide}, but ${idxSide} (failed check: ${d.check}). ` +
      `This exact block, transaction and log were discovered by range bisection during the run — none was known in advance.`;
  } else {
    divPara = `A disagreement was detected but no single first-divergence event could be pinned.`;
  }

  return (
    `Audit ${r.runId} — FAILED.\n\n` +
    `Over ${range}, the raw chain has ${rawN} ${r.event} event(s) but ${idx} reported ${subN}. ` +
    `The following check(s) failed: ${list(failed)}.` +
    (passed.length ? ` (Still passing: ${list(passed)}.)` : "") +
    unverifiedNote +
    `\n\n` +
    divPara
  );
}
