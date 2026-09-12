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
import { buildCandidateManifest, shortHash } from "./candidate.js";
import { decideGate } from "./gate.js";
import type { AuditReport, CheckResult } from "./types.js";
import { toJSON } from "./bigint.js";
import { evidenceRoot } from "./evidence.js";
import { buildErc4626 } from "./build.js";
import { applyKnownErc4626Repair, createRepairContext } from "./repair.js";
import {
  createVerificationRun,
  freshnessFor,
  loadVerificationRun,
  requiredStrongChecksPassed,
  saveVerificationRun,
} from "./run-store.js";

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

async function runBuild(rest: string[]): Promise<number> {
  const args = parseArgs(rest);
  const intent = args.intent;
  if (!intent) throw new Error('--intent "Build an ERC-4626 indexer on Base for 0x..." is required');
  if (!args["start-block"]) throw new Error("--start-block <N> is required so the candidate has an explicit historical boundary");
  const output = args.output ?? `.lute/builds/${newRunId()}`;
  const result = await buildErc4626({
    intent,
    contract: args.contract,
    startBlock: args["start-block"],
    outputDir: output,
    templateDir: args.template,
    compile: args.compile !== "false",
    graphCommand: args["graph-command"],
  });
  if (args.json === "true") process.stdout.write(toJSON(result) + "\n");
  else process.stdout.write(["LUTE BUILD", "", `Candidate: ${result.candidateDir}`, `Contract:  ${result.contract}`, `Start:     ${result.startBlock}`, `Hash:      ${result.candidate.candidateHash}`, "", ...result.stages.map((stage) => `${stage.status.padEnd(7)} ${stage.name}: ${stage.detail}`), "", "Next: run the unchanged verifier, then lute gate before any deploy."].join("\n") + "\n");
  return 0;
}

function runRepair(rest: string[]): number {
  const args = parseArgs(rest);
  if (!args.file) throw new Error("--file <VerificationRun.json> is required for repair");
  const run = loadVerificationRun(args.file);
  const context = createRepairContext(run);
  if (args["apply-known-fix"] === "true") {
    if (run.verdict !== "FAILED") throw new Error("known repair may only be applied to a FAILED VerificationRun");
    const candidateDir = args.candidate ?? run.candidate.root;
    const applied = applyKnownErc4626Repair(candidateDir);
    if (!applied.changed) throw new Error(`known ERC-4626 identity repair did not match ${applied.file}`);
    context.recommendedActions.unshift(`Applied known identity repair to ${applied.file}; candidate hash must be recomputed and reverified.`);
  }
  if (args.json === "true") process.stdout.write(toJSON(context) + "\n");
  else process.stdout.write(["LUTE REPAIR CONTEXT", "", `Run:          ${context.runId}`, `Candidate:    ${context.candidateHash}`, `Failed:       ${context.failedChecks.join(", ") || "none"}`, `Files:        ${context.relevantFiles.join(", ") || "none"}`, "", ...context.recommendedActions.map((action) => `- ${action}`)].join("\n") + "\n");
  return 0;
}

async function runGate(rest: string[]): Promise<number> {
  const args = parseArgs(rest);
  const candidateDir = args.candidate ?? "subgraph";
  const quiet = args.json === "true";
  const verifiedRunPath = args.run ?? args["verification-file"];
  if (!verifiedRunPath) throw new Error("--run <VerificationRun.json> is required; gate never self-verifies a candidate");

  // Hash the exact candidate that would be deployed and load a prior run.
  const manifest = buildCandidateManifest(candidateDir);
  const verifiedRun = loadVerificationRun(verifiedRunPath);
  const report = verifiedRun.report;
  const gate = decideGate({
    verdict: report.verdict,
    candidateHash: manifest.candidateHash,
    verifiedCandidateHash: verifiedRun.candidateHash,
    requiredStrongChecksPassed: requiredStrongChecksPassed(report.checks),
    sourcesComplete: verifiedRun.coverage?.sourcesComplete ?? (report.verdict !== "INCONCLUSIVE" && !!report.rawEvidence && !!report.subgraphEvidence),
    revoked: verifiedRun.revoked,
    freshnessOk: freshnessFor(verifiedRun),
  });

  if (quiet) {
    process.stdout.write(toJSON({ candidate: manifest, verifiedRun, gate }) + "\n");
  } else {
    const L = ["LUTE DEPLOYMENT GATE", "", `Candidate:     ${candidateDir}  (${manifest.fileCount} files)`,
      `Candidate hash: ${shortHash(manifest.candidateHash)}…`, `Verified hash: ${shortHash(verifiedRun.candidateHash)}…`,
      `Verification:  ${verifiedRun.runId}`, `Verdict:       ${report.verdict}`,
      `RAW_RPC:       ${report.rawEvidence?.eventCount ?? "—"}   SUBGRAPH: ${report.subgraphEvidence?.recordCount ?? "—"}`,
      "", `GATE:          ${gate.state} (${gate.allowed ? "deployment allowed" : "deployment blocked"})`,
      `Reason:        ${gate.reasons.join("; ")}`];
    if (report.verdict === "FAILED" && report.firstDivergence) {
      L.push(`First divergence: block ${report.firstDivergence.blockNumber} · log ${report.firstDivergence.logIndex} · ${report.firstDivergence.check}`);
    }
    process.stdout.write(L.join("\n") + "\n");
  }
  return gate.allowed ? 0 : 2;
}

async function runVerify(rest: string[]): Promise<number> {
  const args = parseArgs(rest);
  const contract = args.contract;
  const eventName = args.event ?? "Deposit";
  if (!contract) throw new Error("--contract is required");
  if (!args["from-block"] || !args["to-block"]) throw new Error("--from-block and --to-block are required");
  const candidateDir = args.candidate ?? "subgraph";
  const runId = newRunId();
  const quiet = args.json === "true";
  const logger = new Logger(runId, !quiet);
  const rpc = resolveVerifierRpc(logger);
  const source = makeSource(args.subgraph ?? "morpho", contract, eventName, rpc, { allowRemoteGraphNodeUrl: true });
  const report = await runAudit({
    rpc,
    contract,
    eventName,
    fromBlock: BigInt(args["from-block"]),
    toBlock: BigInt(args["to-block"]),
    subgraph: source,
    logger,
    runId,
    minConfirmations: args["min-confirmations"] ? BigInt(args["min-confirmations"]) : undefined,
  });
  const candidate = buildCandidateManifest(candidateDir);
  const run = createVerificationRun({ report, candidate, evidenceRoot: report.evidenceRoot ?? evidenceRoot(report) });
  const output = saveVerificationRun(run, args.output);
  if (quiet) process.stdout.write(toJSON({ ...run, file: output }) + "\n");
  else process.stdout.write(`LUTE VERIFICATION\n\nRun: ${run.runId}\nCandidate: ${candidate.candidateHash}\nVerdict: ${run.verdict}\nSaved: ${output}\n`);
  return verdictExitCode(report.verdict);
}

async function main(): Promise<number> {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === "build") return runBuild(rest);
  if (cmd === "repair") return runRepair(rest);
  if (cmd === "watch") return runWatch(rest);
  if (cmd === "verify") return runVerify(rest);
  if (cmd === "explain") return runExplain(rest);
  if (cmd === "attest") return runAttest(rest);
  if (cmd === "gate") return runGate(rest);
  if (cmd !== "audit") {
    process.stderr.write(
      "usage:\n  lute build  --intent \"Build an ERC-4626 indexer on Base for 0x..\" --start-block N --output <dir> [--compile false] [--json]\n  lute repair --file <VerificationRun.json> [--candidate <dir>] [--apply-known-fix] [--json]\n  lute audit  --network base --contract 0x.. --subgraph <morpho|graphnode:<name>|substreams|local[:bug]> --event Deposit|Withdraw --from-block N --to-block N [--json] [--explain] [--attest]\n  lute verify --candidate <dir> --contract 0x.. --subgraph <src> --event .. --from-block N --to-block N [--output <run.json>] [--json]\n  lute gate   --candidate <dir> --run <VerificationRun.json> [--json]\n  lute watch  --config <targets.json> [--json]\n  lute explain --file <report.json>\n  lute attest  --file <report.json>   (publishes the verdict to Hedera HCS)\n",
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

  // CLI is a trusted operator context, so full graphnode: URLs are allowed here.
  const source = makeSource(subgraphArg, contract, eventName, rpc, { allowRemoteGraphNodeUrl: true });
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
