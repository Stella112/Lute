// Batch runner — operate Lute over a watchlist of targets.
//
// Each target is audited independently; one target's failure (even a thrown error) is
// isolated and never aborts the batch or leaks into another target's verdict. The
// batch rolls up to a single status so a scheduler / CI job can act on it, and emits a
// structured alert line for every non-VERIFIED target.

import { runAudit } from "./audit.js";
import { newRunId, Logger } from "./logger.js";
import { resolveVerifierRpc, type BaseRpc } from "./rpc.js";
import { makeSource } from "./sources.js";
import { summarize } from "./explain.js";
import type { AuditReport, Verdict } from "./types.js";

export type TargetSpec = {
  name: string;
  network?: "base";
  contract: string;
  event: "Deposit" | "Withdraw";
  fromBlock: string | number;
  toBlock: string | number;
  subgraph?: string; // default "morpho"
};

export type TargetResult = {
  name: string;
  verdict: Verdict;
  report: AuditReport | null;
  error?: string;
};

export type BatchReport = {
  runId: string;
  ranAt: string;
  summary: { total: number; verified: number; failed: number; inconclusive: number };
  verdict: Verdict; // batch rollup
  results: TargetResult[];
};

/** Pure rollup: batch is FAILED if any target FAILED, else INCONCLUSIVE if any is, else VERIFIED. */
export function rollup(results: TargetResult[]): { summary: BatchReport["summary"]; verdict: Verdict } {
  const summary = {
    total: results.length,
    verified: results.filter((r) => r.verdict === "VERIFIED").length,
    failed: results.filter((r) => r.verdict === "FAILED").length,
    inconclusive: results.filter((r) => r.verdict === "INCONCLUSIVE").length,
  };
  const verdict: Verdict =
    summary.failed > 0 ? "FAILED" : summary.inconclusive > 0 ? "INCONCLUSIVE" : "VERIFIED";
  return { summary, verdict };
}

export function verdictExitCode(v: Verdict): number {
  return v === "VERIFIED" ? 0 : v === "FAILED" ? 2 : 3;
}

export async function runBatch(targets: TargetSpec[], opts?: { rpc?: BaseRpc; logger?: Logger }): Promise<BatchReport> {
  const runId = newRunId();
  const logger = opts?.logger ?? new Logger(runId);
  const rpc = opts?.rpc ?? resolveVerifierRpc(logger);

  const results: TargetResult[] = [];
  for (const t of targets) {
    try {
      const source = makeSource(t.subgraph ?? "morpho", t.contract, t.event, rpc);
      const report = await runAudit({
        rpc,
        contract: t.contract,
        eventName: t.event,
        fromBlock: BigInt(t.fromBlock),
        toBlock: BigInt(t.toBlock),
        subgraph: source,
        logger,
      });
      results.push({ name: t.name, verdict: report.verdict, report });
      if (report.verdict !== "VERIFIED") {
        logger.warn("alert.target", {
          stage: "batch",
          target: t.name,
          contract: t.contract,
          status: report.verdict,
          first_divergence_block: report.firstDivergence?.blockNumber,
          reason: report.inconclusiveReason,
          summary: summarize(report),
        });
      }
    } catch (e) {
      // isolate: a target that throws is INCONCLUSIVE, batch continues
      logger.error("target.threw", { stage: "batch", target: t.name, err: (e as Error).message });
      results.push({ name: t.name, verdict: "INCONCLUSIVE", report: null, error: (e as Error).message });
    }
  }

  const { summary, verdict } = rollup(results);
  logger.info("batch.complete", { stage: "batch", status: verdict, ...summary });
  return { runId, ranAt: new Date().toISOString(), summary, verdict, results };
}
