#!/usr/bin/env node
// Lute MCP server (Phase 2).
//
// Exposes the verified Phase 1 reconciler as agent-callable tools over stdio.
// The audit engine, RPC reader, ABI decoder and Subgraph sources are reused
// unchanged from Phase 1 — this file only adapts them to the MCP protocol.
//
// Protocol note: MCP speaks JSON-RPC on stdout. All human/structured logging goes to
// stderr (see Logger), so it never corrupts the protocol stream.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { runAudit } from "./audit.js";
import { ERC4626_EVENTS } from "./abi.js";
import { explainReport } from "./explain.js";
import type { AuditReport } from "./types.js";
import { toJSON } from "./bigint.js";
import { newRunId, Logger } from "./logger.js";
import { resolveVerifierRpc } from "./rpc.js";
import { makeSource } from "./sources.js";
import {
  buildWorkflow,
  deployWorkflow,
  gateWorkflow,
  listWorkflowBuilds,
  monitorWorkflow,
  repairWorkflow,
  verifyWorkflow,
  integrityPackWorkflow,
} from "./control-plane.js";

const BlockInput = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]);
function toBig(v: number | string): bigint {
  return typeof v === "number" ? BigInt(v) : BigInt(v);
}

const server = new McpServer({ name: "lute", version: "0.1.0" });

server.registerTool(
  "lute_audit",
  {
    title: "Lute reconciliation audit",
    description:
      "Independently verify a Subgraph-class index against raw Base RPC logs for an ERC-4626 " +
      "vault. Reconstructs event facts from eth_getLogs + ABI decode (never from the index's " +
      "mapping) and compares counts, per-event presence, fields (assets/shares), block and " +
      "transaction provenance, and duplicates. On disagreement it bisects the block range to " +
      "the first divergent (block, tx, logIndex). Returns a machine-readable verdict: VERIFIED, " +
      "FAILED, or INCONCLUSIVE (any infrastructure failure is INCONCLUSIVE, never VERIFIED). " +
      "subgraph=morpho audits the real Morpho public index; subgraph=graphstudio audits the deployed " +
      "Graph Studio subgraph; subgraph=local:<bug> audits a local " +
      "mapping (bugs: block-id, swap-fields, duplicate) for controlled demonstrations.",
    inputSchema: {
      network: z.enum(["base"]).default("base").describe("only Base is supported in phase 1/2"),
      contract: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("ERC-4626 vault address on Base"),
      event: z.enum(["Deposit", "Withdraw"]).default("Deposit"),
      fromBlock: BlockInput.describe("inclusive start block"),
      toBlock: BlockInput.describe("inclusive end block (should be well behind chain head)"),
      subgraph: z
        .string()
        .default("morpho")
        .describe("morpho | graphstudio | graphnode:<name> | substreams | local | local:block-id | local:swap-fields | local:duplicate"),
      minConfirmations: BlockInput.optional().describe(
        "reorg safety: require the range end to be at least this many blocks behind head, else INCONCLUSIVE",
      ),
    },
  },
  async (args) => {
    const runId = newRunId();
    const logger = new Logger(runId); // stderr only
    const rpc = resolveVerifierRpc(logger);
    const contract = args.contract;
    const eventName = args.event ?? "Deposit";
    const source = makeSource(args.subgraph ?? "morpho", contract, eventName, rpc);

    const report = await runAudit({
      rpc,
      contract,
      eventName,
      fromBlock: toBig(args.fromBlock),
      toBlock: toBig(args.toBlock),
      subgraph: source,
      logger,
      runId,
      minConfirmations: args.minConfirmations !== undefined ? toBig(args.minConfirmations) : undefined,
    });

    return {
      content: [{ type: "text" as const, text: toJSON(report) }],
      // surface the verdict on the tool result so callers can branch without parsing
      isError: false,
    };
  },
);

server.registerTool(
  "lute_build",
  {
    title: "Build an ERC-4626 candidate",
    description:
      "Create a deterministic Base ERC-4626 subgraph candidate from Lute's reviewed template. " +
      "Returns a build id, exact candidate hash, and stage results. Compilation is off by default; " +
      "this tool never verifies or deploys the result automatically.",
    inputSchema: {
      intent: z.string().min(8).max(2000).describe("for example: Build an ERC-4626 indexer on Base for 0x..."),
      contract: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
      startBlock: BlockInput.describe("explicit historical start block"),
      compile: z.boolean().default(false).describe("run Graph codegen/build; may install candidate dependencies"),
    },
  },
  async (args) => ({ content: [{ type: "text" as const, text: toJSON(await buildWorkflow(args)) }] }),
);

server.registerTool(
  "lute_verify",
  {
    title: "Verify a candidate and persist the run",
    description:
      "Run Lute's unchanged raw-chain-versus-index verifier and persist a VerificationRun. " +
      "Use candidateRef=current for the configured candidate or the buildId returned by lute_build. " +
      "The result is VERIFIED, FAILED, or INCONCLUSIVE; infrastructure failures never become VERIFIED.",
    inputSchema: {
      contract: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      event: z.enum(["Deposit", "Withdraw"]).default("Deposit"),
      fromBlock: BlockInput,
      toBlock: BlockInput,
      subgraph: z.string().default("morpho"),
      candidateRef: z.string().default("current").describe("current or an opaque build id from lute_build"),
      minConfirmations: BlockInput.optional(),
    },
  },
  async (args) => ({ content: [{ type: "text" as const, text: toJSON(await verifyWorkflow(args)) }] }),
);

server.registerTool(
  "lute_repair",
  {
    title: "Diagnose or apply a known repair",
    description:
      "Create an evidence-backed RepairContext for a persisted failed run. By default this is diagnostic only. " +
      "Set applyKnownFix=true to apply Lute's narrow ERC-4626 identity repair to the specified build candidate; " +
      "a fresh lute_verify is then mandatory before any gate or deploy.",
    inputSchema: {
      runId: z.string().describe("persisted VerificationRun id"),
      candidateRef: z.string().default("current"),
      applyKnownFix: z.boolean().default(false).describe("explicitly mutate the candidate with the known safe fix"),
    },
  },
  async (args) => ({ content: [{ type: "text" as const, text: toJSON(repairWorkflow(args.runId, args.candidateRef, args.applyKnownFix)) }] }),
);

server.registerTool(
  "lute_deployment_gate",
  {
    title: "Evaluate the deployment gate",
    description:
      "Evaluate whether the exact candidate hash matches the persisted verified run and all fail-closed policy " +
      "checks pass. This does not deploy anything.",
    inputSchema: {
      runId: z.string().describe("persisted VerificationRun id"),
      candidateRef: z.string().default("current"),
    },
  },
  async (args) => ({ content: [{ type: "text" as const, text: toJSON(gateWorkflow(args.runId, args.candidateRef)) }] }),
);

server.registerTool(
  "lute_deploy",
  {
    title: "Preview or deploy a verified candidate",
    description:
      "Build a Graph deployment plan after evaluating the fail-closed gate. dryRun defaults to true and is safe. " +
      "An actual external deployment requires dryRun=false, confirm=true, and LUTE_ENABLE_DEPLOYMENT=true on the " +
      "server; it never accepts a private key or secret as an input.",
    inputSchema: {
      runId: z.string(),
      candidateRef: z.string().default("current"),
      dryRun: z.boolean().default(true),
      confirm: z.boolean().default(false).describe("explicit operator confirmation for external deployment"),
      name: z.string().optional(),
      node: z.string().url().optional(),
      ipfs: z.string().url().optional(),
      versionLabel: z.string().optional(),
    },
  },
  async (args) => ({ content: [{ type: "text" as const, text: toJSON(await deployWorkflow(args)) }] }),
);

server.registerTool(
  "lute_integrity_pack",
  {
    title: "Get a portable Integrity Pack",
    description: "Return the portable, lineage-bound Integrity Pack artifact for a persisted VerificationRun.",
    inputSchema: { runId: z.string() },
  },
  async (args) => {
    return { content: [{ type: "text" as const, text: toJSON(integrityPackWorkflow(args.runId)) }] };
  },
);

server.registerTool(
  "lute_builds",
  {
    title: "List recent Lute builds",
    description: "List recent opaque build ids, hashes, contracts, and stage outcomes without exposing secrets.",
    inputSchema: {},
  },
  async () => ({ content: [{ type: "text" as const, text: toJSON(listWorkflowBuilds()) }] }),
);

server.registerTool(
  "lute_monitor",
  {
    title: "Run the configured Lute watchlist",
    description: "Run the operator-configured watchlist with the unchanged verifier, persist VerificationRuns, and open or resolve evidence-backed incidents.",
    inputSchema: {},
  },
  async () => ({ content: [{ type: "text" as const, text: toJSON(await monitorWorkflow()) }] }),
);

server.registerTool(
  "lute_supported_events",
  {
    title: "Supported ERC-4626 events",
    description:
      "List the ERC-4626 events Lute can verify, with the canonical signature and the topic0 " +
      "derived as keccak256(signature). No network access.",
    inputSchema: {},
  },
  async () => {
    const events = Object.values(ERC4626_EVENTS).map((e) => ({
      name: e.name,
      signature: e.signature,
      topic0: e.topic0,
      params: e.params,
    }));
    return { content: [{ type: "text" as const, text: toJSON(events) }] };
  },
);

server.registerTool(
  "lute_explain",
  {
    title: "Explain an audit report",
    description:
      "Turn a Lute AuditReport (the JSON returned by lute_audit) into a plain-English " +
      "explanation. Deterministic — pure function of the report's fields, no fabrication. " +
      "No network access.",
    inputSchema: {
      report: z.string().describe("the AuditReport JSON returned by lute_audit"),
    },
  },
  async (args) => {
    const report = JSON.parse(args.report) as AuditReport;
    return { content: [{ type: "text" as const, text: explainReport(report) }] };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("lute-mcp: connected on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`lute-mcp fatal: ${(err as Error).message}\n`);
  process.exitCode = 1;
});
