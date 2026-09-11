#!/usr/bin/env node
// Lute dashboard server (Phase 4).
//
// A tiny HTTP server that runs the REAL Phase 1 audit engine (no reimplementation)
// and serves a single-page UI. The browser talks only to this local server
// (same-origin, no CORS); all RPC/Subgraph calls happen server-side in Node.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { runAudit } from "./audit.js";
import { ERC4626_EVENTS } from "./abi.js";
import { toJSON } from "./bigint.js";
import { newRunId, Logger } from "./logger.js";
import { resolveVerifierRpc } from "./rpc.js";
import { makeSource } from "./sources.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(__dirname, "..", "public", "index.html"), "utf8");
// OpenAPI spec (for Bazantic `--spec-url`). Optional — absent in minimal images.
let OPENAPI: string | null = null;
try {
  OPENAPI = readFileSync(join(__dirname, "..", "bazantic", "openapi.json"), "utf8");
} catch {
  OPENAPI = null;
}
const PORT = Number(process.env.PORT ?? 8788);

type AuditBody = {
  contract?: string;
  event?: "Deposit" | "Withdraw";
  fromBlock?: string | number;
  toBlock?: string | number;
  subgraph?: string;
};

async function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function send(res: import("node:http").ServerResponse, status: number, body: string, type = "application/json") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "GET" && url.pathname === "/") return send(res, 200, HTML, "text/html; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/openapi.json") {
      return OPENAPI ? send(res, 200, OPENAPI) : send(res, 404, JSON.stringify({ error: "openapi spec not bundled" }));
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
      return send(res, 200, toJSON(Object.values(ERC4626_EVENTS).map((e) => ({ name: e.name, signature: e.signature, topic0: e.topic0 }))));
    }
    if (req.method === "POST" && url.pathname === "/api/audit") {
      const body = JSON.parse((await readBody(req)) || "{}") as AuditBody;
      if (!body.contract || !/^0x[0-9a-fA-F]{40}$/.test(body.contract)) return send(res, 400, JSON.stringify({ error: "valid --contract required" }));
      if (body.fromBlock === undefined || body.toBlock === undefined) return send(res, 400, JSON.stringify({ error: "fromBlock and toBlock required" }));
      const eventName = body.event ?? "Deposit";
      const runId = newRunId();
      const logger = new Logger(runId); // stderr
      const rpc = resolveVerifierRpc(logger);
      const source = makeSource(body.subgraph ?? "morpho", body.contract, eventName, rpc);
      const report = await runAudit({
        rpc, contract: body.contract, eventName,
        fromBlock: BigInt(body.fromBlock), toBlock: BigInt(body.toBlock),
        subgraph: source, logger, runId,
      });
      return send(res, 200, toJSON(report));
    }
    return send(res, 404, JSON.stringify({ error: "not found" }));
  } catch (e) {
    return send(res, 500, JSON.stringify({ error: (e as Error).message }));
  }
});

server.listen(PORT, () => {
  process.stderr.write(`lute-dashboard: http://localhost:${PORT}\n`);
});
