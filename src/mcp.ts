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
