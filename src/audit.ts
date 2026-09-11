// Audit orchestrator + verdict generation.
//
// Fail-closed rule: any infrastructure failure (an RPC chunk that cannot be
// retrieved, a Subgraph page that fails, malformed data) yields INCONCLUSIVE. Partial
// or missing data must NEVER produce VERIFIED.

import { ERC4626_EVENTS } from "./abi.js";
import { readCanonicalEvents } from "./canonical.js";
import { findFirstDivergence, type RangeFetchers } from "./divergence.js";
import { newRunId, Logger } from "./logger.js";
import { runChecks } from "./reconcile.js";
import { BaseRpc, RpcError } from "./rpc.js";
import { SubgraphError, type SubgraphSource } from "./subgraph/source.js";
import type { AuditReport, CheckResult, Verdict } from "./types.js";

export type AuditOptions = {
  rpc: BaseRpc;
  contract: string;
  eventName: string;
  fromBlock: bigint;
  toBlock: bigint;
  subgraph: SubgraphSource;
  logger?: Logger;
  runId?: string;
  /** Minimum confirmations behind head required for the range end; else INCONCLUSIVE (reorg safety). Default 0 = disabled. */
  minConfirmations?: bigint;
};

/**
 * VERIFIED requires that the checks which can always be computed (count + presence)
 * PASS, that no STRONG check FAILs, and that at least one field was independently
 * verified — so an index that exposes nothing can never be VERIFIED.
 */
export function decideVerdict(checks: CheckResult[]): Verdict {
  const strong = checks.filter((c) => c.class === "STRONG");
  if (strong.some((c) => c.status === "FAIL")) return "FAILED";

  const byName = (n: string) => checks.find((c) => c.name === n);
  const count = byName("event_count");
  const presence = byName("event_presence");
  if (count?.status !== "PASS" || presence?.status !== "PASS") return "INCONCLUSIVE";

  const fieldChecks = checks.filter((c) => c.name.startsWith("field_accuracy:"));
  const anyFieldVerified = fieldChecks.some((c) => c.status === "PASS");
  if (!anyFieldVerified) return "INCONCLUSIVE"; // nothing independently verifiable at field level

  return "VERIFIED";
}

export async function runAudit(opts: AuditOptions): Promise<AuditReport> {
  const runId = opts.runId ?? newRunId();
  const logger = opts.logger ?? new Logger(runId);
  const { rpc, contract, eventName, fromBlock, toBlock, subgraph } = opts;

  const base = {
    runId,
    target: {
      type: "EXTERNAL_AUDIT" as const,
      network: "base" as const,
      contract,
      subgraph: `${subgraph.endpoint} (${subgraph.entity})`,
    },
    event: eventName,
  };

  // unsupported target -> INCONCLUSIVE (never VERIFIED)
  if (!ERC4626_EVENTS[eventName]) {
    return inconclusive(base, fromBlock, toBlock, "unknown", `unsupported event "${eventName}" for ERC-4626 target`);
  }

  // reorg-safety / range sanity
  let safeHead = "unknown";
  try {
    const head = await rpc.blockNumber();
    safeHead = head.toString();
    if (toBlock > head) {
      return inconclusive(base, fromBlock, toBlock, safeHead, `toBlock ${toBlock} is beyond chain head ${head}`);
    }
    const minConf = opts.minConfirmations ?? 0n;
    if (minConf > 0n && head - toBlock < minConf) {
      return inconclusive(
        base,
        fromBlock,
        toBlock,
        safeHead,
        `range end ${toBlock} is only ${head - toBlock} block(s) behind head ${head}; ${minConf} confirmations required (reorg-prone)`,
      );
    }
  } catch (e) {
    return inconclusive(base, fromBlock, toBlock, safeHead, `could not read chain head: ${(e as Error).message}`);
  }

  // RAW_RPC path (independent ground truth)
  let rawResult;
  try {
    rawResult = await logger.stage("read_raw", { source: "RAW_RPC", start_block: fromBlock.toString(), end_block: toBlock.toString() }, () =>
      readCanonicalEvents(rpc, contract, eventName, fromBlock, toBlock),
    );
  } catch (e) {
    if (e instanceof RpcError) {
      return inconclusive(base, fromBlock, toBlock, safeHead, `RAW_RPC read failed (${e.kind}): ${e.message}`);
    }
    throw e;
  }

  // SUBGRAPH path (candidate)
  let idxResult;
  try {
    idxResult = await logger.stage("read_subgraph", { source: "SUBGRAPH" }, () =>
      subgraph.fetchEvents(eventName, fromBlock, toBlock),
    );
  } catch (e) {
    if (e instanceof SubgraphError) {
      return inconclusive(base, fromBlock, toBlock, safeHead, `SUBGRAPH read failed (${e.kind}): ${e.message}`);
    }
    throw e;
  }

  const checks = runChecks({ eventName, raw: rawResult.events, indexed: idxResult.events });
  const verdict = decideVerdict(checks);

  const report: AuditReport = {
    ...base,
    range: { startBlock: fromBlock.toString(), endBlock: toBlock.toString(), safeHead },
    verdict,
    checks,
    eventsChecked: rawResult.events.length,
    rawEvidence: {
      network: "base",
      contract,
      topic0: rawResult.topic0,
      startBlock: fromBlock.toString(),
      endBlock: toBlock.toString(),
      rpcAlias: rpc.alias,
      chunkCount: rawResult.chunkCount,
      eventCount: rawResult.events.length,
    },
    subgraphEvidence: {
      endpoint: subgraph.endpoint,
      entity: subgraph.entity,
      blockFilters: idxResult.blockFilters,
      pageCount: idxResult.pageCount,
      recordCount: idxResult.events.length,
    },
    firstDivergence: null,
  };

  if (verdict === "FAILED") {
    const fetchers: RangeFetchers = {
      fetchRaw: async (a, b) => (await readCanonicalEvents(rpc, contract, eventName, a, b)).events,
      fetchIndexed: async (a, b) => (await subgraph.fetchEvents(eventName, a, b)).events,
    };
    const search = await logger.stage("first_divergence", { stage: "bisect" }, () =>
      findFirstDivergence(fetchers, eventName, fromBlock, toBlock),
    );
    if (search) {
      report.firstDivergence = search.divergence;
      logger.info("first_divergence.found", {
        stage: "bisect",
        steps: search.steps,
        window_from: search.windowFrom,
        window_to: search.windowTo,
      });
    }
  }

  logger.info("audit.complete", {
    network: "base",
    contract,
    start_block: fromBlock.toString(),
    end_block: toBlock.toString(),
    status: verdict,
  });
  return report;
}

function inconclusive(
  base: Pick<AuditReport, "runId" | "target" | "event">,
  fromBlock: bigint,
  toBlock: bigint,
  safeHead: string,
  reason: string,
): AuditReport {
  return {
    ...base,
    range: { startBlock: fromBlock.toString(), endBlock: toBlock.toString(), safeHead },
    verdict: "INCONCLUSIVE",
    checks: [],
    eventsChecked: 0,
    rawEvidence: null,
    subgraphEvidence: null,
    firstDivergence: null,
    inconclusiveReason: reason,
  };
}
