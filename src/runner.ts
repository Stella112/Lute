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

/**
 * POST a human-readable alert to a webhook for every non-VERIFIED target. Slack and
 * generic endpoints get `{text}`; Discord (URL contains "discord") gets `{content}`.
 * Returns false (and never throws) if there is nothing to alert or the post fails.
 */
export async function postAlert(
  url: string,
  batch: BatchReport,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const failing = batch.results.filter((r) => r.verdict !== "VERIFIED");
  if (failing.length === 0) return false;
  const lines = failing.map((r) => {
    const div = r.report?.firstDivergence ? ` @ block ${r.report.firstDivergence.blockNumber}` : "";
    const err = r.error ? ` (${r.error})` : "";
    return `• ${r.name}: ${r.verdict}${div}${err}`;
  });
  const text =
    `Lute watch — ${batch.verdict} ` +
    `(${batch.summary.verified} verified / ${batch.summary.failed} failed / ${batch.summary.inconclusive} inconclusive)\n` +
    lines.join("\n");
  const payload = url.includes("discord") ? { content: text } : { text };
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function runBatch(
  targets: TargetSpec[],
  opts?: { rpc?: BaseRpc; logger?: Logger; webhookUrl?: string; fetchImpl?: typeof fetch },
): Promise<BatchReport> {
  const runId = newRunId();
  const logger = opts?.logger ?? new Logger(runId);
  const rpc = opts?.rpc ?? resolveVerifierRpc(logger);

  const results: TargetResult[] = [];
  for (const t of targets) {
    try {
      // Watch targets come from an operator-controlled config file, so allow full URLs.
      const source = makeSource(t.subgraph ?? "morpho", t.contract, t.event, rpc, { allowRemoteGraphNodeUrl: true });
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

  const webhookUrl = opts?.webhookUrl ?? process.env.WEBHOOK_URL;
  if (webhookUrl && verdict !== "VERIFIED") {
    const ok = await postAlert(webhookUrl, { runId, ranAt: new Date().toISOString(), summary, verdict, results }, opts?.fetchImpl);
    logger.info("alert.webhook", { stage: "batch", status: ok ? "sent" : "failed" });
  }

  return { runId, ranAt: new Date().toISOString(), summary, verdict, results };
}
