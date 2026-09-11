#!/usr/bin/env node
// Lute Phase 1 CLI.
//
//   lute audit --network base --contract 0x... --subgraph <morpho|local[:bug]>
//              --event Deposit|Withdraw --from-block N --to-block N [--json]
//
// --subgraph morpho              audit the real Morpho public index (honest case)
// --subgraph local               audit a faithful local mapping
// --subgraph local:block-id      audit a local mapping with the planted entity-id bug
// --subgraph local:swap-fields   ...assets/shares swapped
// --subgraph local:duplicate     ...duplicate entity emitted

import { readFileSync } from "node:fs";

import { runAudit } from "./audit.js";
import { newRunId, Logger } from "./logger.js";
import { resolveVerifierRpc } from "./rpc.js";
import { makeSource } from "./sources.js";
import { runBatch, verdictExitCode, type BatchReport, type TargetSpec } from "./runner.js";
import { explainReport } from "./explain.js";
import { publishAttestation, isHederaConfigured } from "./hedera.js";
import type { AuditReport, CheckResult } from "./types.js";
import { toJSON } from "./bigint.js";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

function fmtChecks(checks: CheckResult[]): string {
  const w = Math.max(...checks.map((c) => c.name.length), 12);
  return checks.map((c) => `  ${c.name.padEnd(w)}  ${c.status}${c.detail ? "   # " + c.detail : ""}`).join("\n");
}

function printHuman(r: AuditReport): void {
  const L: string[] = [];
  L.push("LUTE AUDIT");
  L.push("");
  L.push(`Target:\n  ${r.target.network}  ${r.target.contract}\n  index: ${r.target.subgraph}`);
  L.push(`Event:\n  ${r.event}`);
  L.push(`Range:\n  ${r.range.startBlock} -> ${r.range.endBlock}  (safe head: ${r.range.safeHead})`);
  if (r.rawEvidence) {
    L.push(`\nRAW_RPC\n  provider: ${r.rawEvidence.rpcAlias}\n  topic0:   ${r.rawEvidence.topic0}\n  chunks:   ${r.rawEvidence.chunkCount}\n  events:   ${r.rawEvidence.eventCount}`);
  }
  if (r.subgraphEvidence) {
    L.push(`\nSUBGRAPH\n  endpoint: ${r.subgraphEvidence.endpoint}\n  entity:   ${r.subgraphEvidence.entity}\n  pages:    ${r.subgraphEvidence.pageCount}\n  events:   ${r.subgraphEvidence.recordCount}`);
  }
  if (r.checks.length) {
    L.push(`\nChecks:\n${fmtChecks(r.checks)}`);
  }
  if (r.inconclusiveReason) L.push(`\nReason:\n  ${r.inconclusiveReason}`);
  L.push(`\nVERDICT:\n  ${r.verdict}`);
  if (r.verdict === "FAILED" && r.firstDivergence) {
    const d = r.firstDivergence;
    L.push("\nFIRST DIVERGENCE");
    L.push(`  Block:       ${d.blockNumber}`);
    L.push(`  Transaction: ${d.transactionHash}`);
    L.push(`  Log index:   ${d.logIndex}`);
    L.push(`  Event:       ${d.event}`);
    L.push(`  Failed check: ${d.check}`);
    L.push(`  RAW_RPC:     ${d.raw ? JSON.stringify(d.raw) : "(missing)"}`);
    L.push(`  SUBGRAPH:    ${d.indexed ? JSON.stringify(d.indexed) : "(missing)"}`);
  }
  process.stdout.write(L.join("\n") + "\n");
}

function printBatch(b: BatchReport): void {
  const L: string[] = ["LUTE WATCH", "", `Ran: ${b.ranAt}`, ""];
  const w = Math.max(...b.results.map((r) => r.name.length), 8);
  for (const r of b.results) {
    const extra =
      r.verdict === "FAILED" && r.report?.firstDivergence
        ? `  first divergence @ block ${r.report.firstDivergence.blockNumber}`
        : r.error
          ? `  (${r.error})`
          : r.report
            ? `  raw=${r.report.rawEvidence?.eventCount ?? "?"} sub=${r.report.subgraphEvidence?.recordCount ?? "?"}`
            : "";
    L.push(`  ${r.name.padEnd(w)}  ${r.verdict}${extra}`);
  }
  L.push("");
  L.push(`Summary: ${b.summary.verified} VERIFIED, ${b.summary.failed} FAILED, ${b.summary.inconclusive} INCONCLUSIVE (of ${b.summary.total})`);
  L.push(`\nBATCH VERDICT:\n  ${b.verdict}`);
  process.stdout.write(L.join("\n") + "\n");
}

async function runWatch(rest: string[]): Promise<number> {
  const args = parseArgs(rest);
  const configPath = args.config;
  if (!configPath) throw new Error("--config <file.json> is required for watch");
  const raw = readFileSync(configPath, "utf8");
  const cfg = JSON.parse(raw) as { targets: TargetSpec[] };
  if (!Array.isArray(cfg.targets) || cfg.targets.length === 0) throw new Error("config must contain a non-empty 'targets' array");
  const quiet = args.json === "true";
  const runId = newRunId();
  const logger = new Logger(runId, !quiet);
  const rpc = resolveVerifierRpc(logger);
  const batch = await runBatch(cfg.targets, { rpc, logger });
  if (quiet) process.stdout.write(toJSON(batch) + "\n");
  else printBatch(batch);
  return verdictExitCode(batch.verdict);
}

function runExplain(rest: string[]): number {
  const args = parseArgs(rest);
  if (!args.file) throw new Error("--file <report.json> is required for explain");
  const report = JSON.parse(readFileSync(args.file, "utf8")) as AuditReport;
  process.stdout.write(explainReport(report) + "\n");
  return verdictExitCode(report.verdict);
}

async function runAttest(rest: string[]): Promise<number> {
  const args = parseArgs(rest);
  if (!args.file) throw new Error("--file <report.json> is required for attest");
  const report = JSON.parse(readFileSync(args.file, "utf8")) as AuditReport;
  if (!isHederaConfigured()) throw new Error("Hedera not configured: set HEDERA_OPERATOR_ID/KEY (see .env)");
  const att = await publishAttestation(report);
  process.stdout.write(`HEDERA ATTESTATION\n  topic:       ${att.topicId}\n  sequence:    ${att.sequenceNumber}\n  transaction: ${att.transactionId}\n  hashscan:    ${att.hashscan}\n`);
  return 0;
}

async function main(): Promise<number> {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === "watch") return runWatch(rest);
  if (cmd === "explain") return runExplain(rest);
  if (cmd === "attest") return runAttest(rest);
  if (cmd !== "audit") {
    process.stderr.write(
      "usage:\n  lute audit --network base --contract 0x.. --subgraph <morpho|graphnode:<name>|local[:bug]> --event Deposit|Withdraw --from-block N --to-block N [--json] [--explain] [--attest]\n  lute watch --config <targets.json> [--json]\n  lute explain --file <report.json>\n  lute attest --file <report.json>   (publishes the verdict to Hedera HCS)\n",
    );
    return 1;
  }
  const args = parseArgs(rest);
  const network = args.network ?? "base";
  if (network !== "base") throw new Error("only --network base is supported in phase 1");
  const contract = args.contract;
  const eventName = args.event ?? "Deposit";
  if (!contract) throw new Error("--contract is required");
  if (!args["from-block"] || !args["to-block"]) throw new Error("--from-block and --to-block are required");
  const fromBlock = BigInt(args["from-block"]);
  const toBlock = BigInt(args["to-block"]);
  const subgraphArg = args.subgraph ?? "morpho";

  const runId = newRunId();
  const quiet = args.json === "true";
  const logger = new Logger(runId, !quiet);
  const rpc = resolveVerifierRpc(logger);

  const source = makeSource(subgraphArg, contract, eventName, rpc);
  const minConfirmations = args["min-confirmations"] ? BigInt(args["min-confirmations"]) : undefined;

  const report = await runAudit({ rpc, contract, eventName, fromBlock, toBlock, subgraph: source, logger, runId, minConfirmations });

  if (quiet) process.stdout.write(toJSON(report) + "\n");
  else printHuman(report);

  if (args.explain === "true") process.stdout.write("\n" + explainReport(report) + "\n");

  if (args.attest === "true") {
    if (!isHederaConfigured()) {
      process.stderr.write("lute: --attest set but Hedera not configured (set HEDERA_OPERATOR_ID/KEY in .env)\n");
    } else {
      const att = await publishAttestation(report);
      process.stdout.write(`\nHEDERA ATTESTATION\n  topic:       ${att.topicId}\n  sequence:    ${att.sequenceNumber}\n  transaction: ${att.transactionId}\n  hashscan:    ${att.hashscan}\n`);
    }
  }

  return verdictExitCode(report.verdict);
}

main().then(
  (code) => {
    // Set exitCode and let the loop drain. Calling process.exit() while the tsx/esbuild
    // loader still holds handles triggers a libuv assertion on Windows.
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`lute: ${(err as Error).message}\n`);
    process.exitCode = 1;
  },
);
