#!/usr/bin/env node
// Lute HTTP API and dashboard server.
// The API delegates to the same audit engine used by the CLI/MCP surfaces. It never
// accepts a model-supplied verdict or a caller-controlled filesystem path.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve as resolvePath, sep } from "node:path";

import { runAudit } from "./audit.js";
import { ERC4626_EVENTS } from "./abi.js";
import { buildCandidateManifest } from "./candidate.js";
import { evidenceRoot } from "./evidence.js";
import { toJSON } from "./bigint.js";
import { newRunId, Logger } from "./logger.js";
import { resolveVerifierRpc } from "./rpc.js";
import { makeSource } from "./sources.js";
import { createVerificationRun, loadVerificationRun, saveVerificationRun } from "./run-store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "..");
const WEB_DIR = process.env.LUTE_WEB_DIR ?? join(APP_ROOT, "web", "dist");
const LEGACY_HTML = readFileSync(join(APP_ROOT, "public", "index.html"), "utf8");
let OPENAPI: string | null = null;
try {
  OPENAPI = readFileSync(join(__dirname, "..", "bazantic", "openapi.json"), "utf8");
} catch {
  OPENAPI = null;
}

const PORT = Number(process.env.PORT ?? 8788);
const MAX_BODY_BYTES = parsePositiveNumber(process.env.API_MAX_BODY_BYTES, 1_048_576);
const CANDIDATE_DIR = process.env.LUTE_CANDIDATE_DIR ?? "subgraph";

type AuditBody = {
  contract?: unknown;
  event?: unknown;
  fromBlock?: unknown;
  toBlock?: unknown;
  subgraph?: unknown;
};

class RequestError extends Error {
  constructor(readonly status: 400 | 413, message: string) {
    super(message);
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const declared = req.headers["content-length"];
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_BODY_BYTES) {
    throw new RequestError(413, `request body exceeds ${MAX_BODY_BYTES} bytes`);
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    bytes += buf.length;
    if (bytes > MAX_BODY_BYTES) throw new RequestError(413, `request body exceeds ${MAX_BODY_BYTES} bytes`);
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json"): void {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : toJSON(body));
}

function parseBody(raw: string): AuditBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    throw new RequestError(400, "request body must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RequestError(400, "request body must be a JSON object");
  }
  return parsed as AuditBody;
}

function parseBlock(value: unknown, name: string): bigint {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new RequestError(400, `${name} must be a non-negative integer`);
    return BigInt(value);
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new RequestError(400, `${name} must be a decimal integer string`);
  return BigInt(value);
}

function validateBody(body: AuditBody): { contract: string; eventName: "Deposit" | "Withdraw"; fromBlock: bigint; toBlock: bigint; subgraph: string } {
  if (typeof body.contract !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(body.contract)) {
    throw new RequestError(400, "contract must be a valid EVM address");
  }
  const eventName = body.event === undefined ? "Deposit" : body.event;
  if (eventName !== "Deposit" && eventName !== "Withdraw") throw new RequestError(400, "event must be Deposit or Withdraw");
  const fromBlock = parseBlock(body.fromBlock, "fromBlock");
  const toBlock = parseBlock(body.toBlock, "toBlock");
  if (toBlock < fromBlock) throw new RequestError(400, "toBlock must be greater than or equal to fromBlock");
  const subgraph = body.subgraph === undefined ? "morpho" : body.subgraph;
  if (typeof subgraph !== "string" || subgraph.length === 0 || subgraph.length > 256) throw new RequestError(400, "subgraph must be a non-empty name");
  return { contract: body.contract, eventName, fromBlock, toBlock, subgraph };
}

async function executeAudit(body: AuditBody, runId: string) {
  const target = validateBody(body);
  const logger = new Logger(runId);
  const rpc = resolveVerifierRpc(logger);
  const source = makeSource(target.subgraph, target.contract, target.eventName, rpc);
  return runAudit({ rpc, contract: target.contract, eventName: target.eventName, fromBlock: target.fromBlock, toBlock: target.toBlock, subgraph: source, logger, runId });
}

function packManifest(): Record<string, unknown> {
  return {
    id: "erc4626",
    version: "1",
    standard: "ERC-4626",
    supportedChains: ["base"],
    requiredSources: ["RAW_RPC", "SUBGRAPH"],
    strongChecks: ["event_count", "duplicate_detection", "event_presence", "transaction_provenance", "block_provenance", "field_accuracy"],
    unsupportedClaims: ["APY", "arbitrary vault strategy accounting"],
  };
}

function isSafeRunId(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

const FRONTEND_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function frontendFile(pathname: string): { file: string; fallback: boolean } | null {
  if (!existsSync(join(WEB_DIR, "index.html"))) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  const root = resolvePath(WEB_DIR);
  const requested = resolvePath(root, `.${decoded === "/" ? "/index.html" : decoded}`);
  const pathRelativeToRoot = relative(root, requested);
  if (pathRelativeToRoot.startsWith(`..${sep}`) || pathRelativeToRoot === ".." || pathRelativeToRoot.includes(`${sep}..${sep}`)) return null;
  if (existsSync(requested) && statSync(requested).isFile()) return { file: requested, fallback: false };
  return { file: join(root, "index.html"), fallback: true };
}

function serveFrontend(res: ServerResponse, pathname: string): void {
  const target = frontendFile(pathname);
  if (!target) return send(res, 200, LEGACY_HTML, "text/html; charset=utf-8");
  const extension = target.file.slice(target.file.lastIndexOf(".")).toLowerCase();
  const type = FRONTEND_TYPES[extension] ?? "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    "cache-control": target.fallback ? "no-store" : "public, max-age=31536000, immutable",
  });
  res.end(readFileSync(target.file));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "GET" && url.pathname === "/openapi.json") return OPENAPI ? send(res, 200, OPENAPI) : send(res, 404, { error: "openapi spec not bundled" });
    if (req.method === "GET" && url.pathname === "/api/events") return send(res, 200, Object.values(ERC4626_EVENTS).map((e) => ({ name: e.name, signature: e.signature, topic0: e.topic0 })));
    if (req.method === "GET" && url.pathname === "/v1/integrity-packs") return send(res, 200, { packs: [packManifest()] });
    if (req.method === "GET" && url.pathname === "/v1/integrity-packs/erc4626@1") return send(res, 200, packManifest());

    const verificationMatch = url.pathname.match(/^\/v1\/verifications\/([^/]+)(?:\/(evidence|manifest))?$/);
    if (req.method === "GET" && verificationMatch) {
      const id = verificationMatch[1]!;
      if (!isSafeRunId(id)) return send(res, 400, { error: "invalid verification id" });
      const run = loadVerificationRun(id);
      if (verificationMatch[2] === "evidence") return send(res, 200, { runId: run.runId, evidenceRoot: run.evidenceRoot, report: run.report });
      if (verificationMatch[2] === "manifest") return send(res, 200, run.candidate);
      return send(res, 200, run);
    }

    if (req.method === "POST" && (url.pathname === "/api/audit" || url.pathname === "/v1/audits")) {
      const report = await executeAudit(parseBody(await readBody(req)), newRunId());
      return send(res, 200, report);
    }

    if (req.method === "POST" && url.pathname === "/v1/verifications") {
      const report = await executeAudit(parseBody(await readBody(req)), newRunId());
      const candidate = buildCandidateManifest(CANDIDATE_DIR);
      const run = createVerificationRun({ report, candidate, evidenceRoot: report.evidenceRoot ?? evidenceRoot(report) });
      const file = saveVerificationRun(run);
      return send(res, report.verdict === "VERIFIED" ? 201 : 200, { ...run, file });
    }

    if (req.method === "GET" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/v1/")) {
      serveFrontend(res, url.pathname);
      return;
    }

    return send(res, 404, { error: "not found" });
  } catch (error) {
    if (error instanceof RequestError) return send(res, error.status, { error: error.message });
    if (error instanceof Error && /verification run not found|invalid VerificationRun file/.test(error.message)) return send(res, 404, { error: error.message });
    return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("API_MAX_BODY_BYTES must be a positive safe integer");
  return parsed;
}

if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  server.requestTimeout = 360_000;
  server.headersTimeout = 15_000;
  server.listen(PORT, () => process.stderr.write(`lute-dashboard: http://localhost:${PORT}\n`));
}

export { server, executeAudit, validateBody };
