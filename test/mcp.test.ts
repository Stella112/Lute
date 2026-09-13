// LIVE MCP end-to-end test: spawns the real lute-mcp server over stdio, drives it as
// an MCP client, and asserts the honest/bugged verdicts come back through the tool.
// Needs network access.

import { test } from "node:test";
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { AuditReport } from "../src/types.js";

const VAULT = "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183";

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath, // node
    args: ["--import", "tsx", "src/mcp.ts"],
    cwd: process.cwd(),
  });
  const client = new Client({ name: "lute-test", version: "0.1.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

function reportFrom(res: unknown): AuditReport {
  const content = (res as { content?: Array<{ type: string; text: string }> }).content ?? [];
  const text = content.find((c) => c.type === "text")?.text;
  assert.ok(text, "tool must return text content");
  return JSON.parse(text) as AuditReport;
}

test("MCP server exposes lute tools", { timeout: 60000 }, async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "lute_audit",
      "lute_build",
      "lute_builds",
      "lute_deploy",
      "lute_deployment_gate",
      "lute_explain",
      "lute_integrity_pack",
      "lute_monitor",
      "lute_repair",
      "lute_supported_events",
      "lute_verify",
    ]);
  });
});

test("lute_supported_events returns derived topic0s", { timeout: 60000 }, async () => {
  await withClient(async (client) => {
    const res = await client.callTool({ name: "lute_supported_events", arguments: {} });
    const events = JSON.parse((res.content as Array<{ text: string }>)[0]!.text) as Array<{ name: string; topic0: string }>;
    const dep = events.find((e) => e.name === "Deposit");
    assert.equal(dep?.topic0, "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7");
  });
});

test("lute_audit via MCP: honest VERIFIED, bugged FAILED with first divergence", { timeout: 180000 }, async () => {
  await withClient(async (client) => {
    const honest = reportFrom(
      await client.callTool({
        name: "lute_audit",
        arguments: { network: "base", contract: VAULT, event: "Deposit", fromBlock: 51115000, toBlock: 51125000, subgraph: "morpho" },
      }),
    );
    assert.equal(honest.verdict, "VERIFIED");
    assert.equal(honest.rawEvidence!.eventCount, honest.subgraphEvidence!.recordCount);

    const bugged = reportFrom(
      await client.callTool({
        name: "lute_audit",
        arguments: { network: "base", contract: VAULT, event: "Deposit", fromBlock: 51115000, toBlock: 51125000, subgraph: "local:block-id" },
      }),
    );
    assert.equal(bugged.verdict, "FAILED");
    assert.equal(bugged.rawEvidence!.eventCount - bugged.subgraphEvidence!.recordCount, 1);
    assert.ok(bugged.firstDivergence);
    assert.match(bugged.firstDivergence!.transactionHash, /^0x[0-9a-f]{64}$/);
  });
});
