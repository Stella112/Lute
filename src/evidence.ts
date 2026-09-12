import { createHash } from "node:crypto";

import type { AuditReport } from "./types.js";

/** Deterministic JSON for evidence hashing; object key order is never incidental. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "evidenceRoot")
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

/** Hash the completed audit evidence, excluding the run id and any prior root. */
export function evidenceRoot(report: AuditReport): string {
  const evidence = {
    target: report.target,
    event: report.event,
    range: report.range,
    verdict: report.verdict,
    checks: report.checks,
    eventsChecked: report.eventsChecked,
    rawEvidence: report.rawEvidence,
    subgraphEvidence: report.subgraphEvidence,
    firstDivergence: report.firstDivergence,
    inconclusiveReason: report.inconclusiveReason ?? null,
  };
  return createHash("sha256").update(canonical(evidence)).digest("hex");
}
