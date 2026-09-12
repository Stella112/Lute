#!/usr/bin/env node
// Lute paid verification server (contract §45–47).
//
// A REAL x402-gated service on Hedera testnet, settled through the Blocky402 facilitator.
// An external agent pays for verification COMPUTE (distinct from paying The Graph for
// data, or paying a Bazantic ingredient). No X-PAYMENT -> HTTP 402 with Hedera payment
// requirements. With a valid X-PAYMENT -> Lute verifies the payment via Blocky402
// (/verify), runs the ACTUAL reconciler, settles on-chain (/settle), and only then
// returns the verdict/evidence. Fail-closed: if settlement fails, no result is returned.
//
// Env: HEDERA_OPERATOR_ID (payTo / Lute account), BLOCKY402_URL
// (default https://api.testnet.blocky402.com), PAID_PORT (default 8793).

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { runAudit } from "../audit.js";
import { toJSON } from "../bigint.js";
import { newRunId, Logger } from "../logger.js";
import { resolveVerifierRpc } from "../rpc.js";
import { makeSource } from "../sources.js";
import { buildCandidateManifest } from "../candidate.js";
import { evidenceRoot } from "../evidence.js";
import { createVerificationRun, saveVerificationRun } from "../run-store.js";
import { quote } from "./quote.js";
import { summarize } from "../explain.js";
import {
  DEFAULT_MAX_BLOCK_SPAN,
  DEFAULT_MAX_BODY_BYTES,
  PaidRequestError,
  parsePaidAuditBody,
  type PaidAuditBody,
} from "./validation.js";

const X402_VERSION = 2;
const NETWORK = "hedera:testnet";
const ASSET_HBAR = "0.0.0";
const FACILITATOR = (process.env.BLOCKY402_URL ?? "https://api.testnet.blocky402.com").replace(/\/$/, "");
const PAY_TO = process.env.HEDERA_OPERATOR_ID ?? "";
const PORT = Number(process.env.PAID_PORT ?? 8793);
const PUBLIC_BASE_URL = (process.env.PAID_PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const MAX_BLOCK_SPAN = parsePositiveBigInt(process.env.PAID_MAX_BLOCK_SPAN, DEFAULT_MAX_BLOCK_SPAN);
const MAX_BODY_BYTES = parsePositiveNumber(process.env.PAID_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES);
const CANDIDATE_DIR = process.env.LUTE_CANDIDATE_DIR ?? "subgraph";

type Requirements = {
  scheme: "exact"; network: string; amount: string; payTo: string;
  maxTimeoutSeconds: number; asset: string; resource: string; description: string;
  mimeType: string; extra?: Record<string, unknown>;
};

let FEE_PAYER: string | undefined; // facilitator's Hedera fee-payer, from /supported

async function loadFeePayer(): Promise<void> {
  const res = await fetch(`${FACILITATOR}/supported`);
  if (!res.ok) throw new Error(`Blocky402 /supported HTTP ${res.status}`);
  const body = (await res.json()) as {
    kinds?: { scheme: string; network: string; extra?: { feePayer?: string } }[];
    signers?: Record<string, string[]>;
  };
  const kind = body.kinds?.find((k) => k.network === NETWORK && k.scheme === "exact");
  if (!kind) throw new Error(`Blocky402 does not advertise ${NETWORK}`);
  FEE_PAYER = kind.extra?.feePayer ?? body.signers?.["hedera:*"]?.[0];
  if (!FEE_PAYER) throw new Error(`Blocky402 did not advertise a fee payer for ${NETWORK}`);
}

async function facilitator(path: "/verify" | "/settle", payload: unknown, requirements: Requirements) {
  const res = await fetch(`${FACILITATOR}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x402Version: X402_VERSION, paymentPayload: payload, paymentRequirements: requirements }),
  });
  if (!res.ok) throw new Error(`facilitator ${path} HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function buildPaymentRequired(resource: string, error: string, requirements: Requirements) {
  const body = {
    x402Version: X402_VERSION as 2,
    error,
    resource: {
      url: resource,
      description: "Lute paid verification",
      mimeType: "application/json",
    },
    accepts: [requirements],
  };
  return {
    body,
    header: Buffer.from(JSON.stringify(body), "utf8").toString("base64"),
  };
}

function sendPaymentRequired(res: ServerResponse, resource: string, error: string, requirements: Requirements) {
  const paymentRequired = buildPaymentRequired(resource, error, requirements);
  return send(res, 402, paymentRequired.body, { "PAYMENT-REQUIRED": paymentRequired.header });
}

async function readBody(req: IncomingMessage): Promise<string> {
  const declared = req.headers["content-length"];
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_BODY_BYTES) {
    throw new PaidRequestError(`request body exceeds ${MAX_BODY_BYTES} bytes`, 413);
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const c of req) {
    const chunk = c as Buffer;
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new PaidRequestError(`request body exceeds ${MAX_BODY_BYTES} bytes`, 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handlePaid(req: IncomingMessage, res: ServerResponse, resource: string) {
  if (!PAY_TO) return send(res, 503, { error: "not configured: set HEDERA_OPERATOR_ID (the Lute payTo account)" });
  const body = parsePaidAuditBody(await readBody(req), { maxBlockSpan: MAX_BLOCK_SPAN });
  const { contract, event: eventName, fromBlock, toBlock } = body;
  const q = quote(fromBlock, toBlock);

  const requirements: Requirements = {
    scheme: "exact", network: NETWORK, amount: q.tinybars, payTo: PAY_TO,
    maxTimeoutSeconds: 300, asset: ASSET_HBAR, resource, mimeType: "application/json",
    description: `Lute ${q.tier} verification of ${eventName} on ${contract} [${fromBlock}-${toBlock}]`,
    ...(FEE_PAYER ? { extra: { feePayer: FEE_PAYER } } : {}),
  };

  const header = req.headers["x-payment"];
  if (!header || typeof header !== "string") {
    return sendPaymentRequired(res, resource, "payment required", requirements);
  }

  let payment: unknown;
  try {
    payment = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch (e) {
    return sendPaymentRequired(res, resource, `invalid X-PAYMENT: ${(e as Error).message}`, requirements);
  }

  // 1) verify the payment via Blocky402 (does not run Lute's business logic)
  const verify = (await facilitator("/verify", payment, requirements)) as { isValid: boolean; payer?: string; invalidReason?: string };
  if (!verify.isValid) {
    return sendPaymentRequired(res, resource, `payment invalid: ${verify.invalidReason ?? "unknown"}`, requirements);
  }

  // 2) run the REAL verification compute
  const runId = newRunId();
  const logger = new Logger(runId);
  const rpc = resolveVerifierRpc(logger);
  const report = await runAudit({
    rpc, contract, eventName, fromBlock, toBlock,
    subgraph: makeSource(body.subgraph, contract, eventName, rpc), logger, runId,
  });

  // 3) settle on-chain; only release the result if settlement actually succeeds
  const settle = (await facilitator("/settle", payment, requirements)) as { success: boolean; transaction?: string; network?: string; payer?: string; errorReason?: string };
  if (!settle.success) {
    return sendPaymentRequired(res, resource, `settlement failed: ${settle.errorReason ?? "unknown"}`, requirements);
  }

  // Persist the paid result in the same evidence store as free audits so the live
  // dashboard can show the paid verification history after container restarts.
  const candidate = buildCandidateManifest(CANDIDATE_DIR);
  const stored = createVerificationRun({
    report,
    candidate,
    evidenceRoot: report.evidenceRoot ?? evidenceRoot(report),
  });
  const file = saveVerificationRun(stored);

  const result = {
    paid: { transaction: settle.transaction, network: settle.network, payer: settle.payer, amount: q.tinybars, asset: ASSET_HBAR, tier: q.tier },
    verdict: report.verdict,
    summary: summarize(report),
    report,
    run: {
      runId: report.runId, verdict: report.verdict, eventsChecked: report.eventsChecked,
      raw: report.rawEvidence?.eventCount ?? null, subgraph: report.subgraphEvidence?.recordCount ?? null,
      firstDivergence: report.firstDivergence,
      evidenceRoot: stored.evidenceRoot,
      file,
    },
  };
  send(res, 200, toJSON(result), { "X-PAYMENT-RESPONSE": Buffer.from(JSON.stringify(settle)).toString("base64") });
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (req.method === "POST" && url.pathname === "/v1/paid/audits") {
    handlePaid(req, res, `${PUBLIC_BASE_URL}${url.pathname}`).catch((e) => {
      if (e instanceof PaidRequestError) return send(res, e.status, { error: e.message });
      send(res, 500, { error: (e as Error).message });
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/") {
    return send(res, 200, { service: "lute paid verification", network: NETWORK, facilitator: FACILITATOR, payTo: PAY_TO || "(unset)", feePayer: FEE_PAYER, usage: "POST /v1/paid/audits with X-PAYMENT; body {contract,event,fromBlock,toBlock,subgraph}" });
  }
  send(res, 404, { error: "not found" });
});

async function main(): Promise<void> {
  if (!/^0\.0\.\d+$/.test(PAY_TO)) throw new Error("HEDERA_OPERATOR_ID must be a Hedera account id such as 0.0.123");
  await loadFeePayer();
  server.requestTimeout = 360_000;
  server.headersTimeout = 15_000;
  server.listen(PORT, () => process.stderr.write(`lute-paid: ${PUBLIC_BASE_URL} · ${NETWORK} · facilitator ${FACILITATOR} · payTo ${PAY_TO} · feePayer ${FEE_PAYER}\n`));
}

if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  main().catch((e) => { process.stderr.write(`lute-paid fatal: ${(e as Error).message}\n`); process.exitCode = 1; });
}

function parsePositiveBigInt(value: string | undefined, fallback: bigint): bigint {
  if (value === undefined) return fallback;
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("PAID_MAX_BLOCK_SPAN must be a positive decimal integer");
  return BigInt(value);
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("PAID_MAX_BODY_BYTES must be a positive safe integer");
  return parsed;
}

export { server, quote, loadFeePayer, parsePaidAuditBody, buildPaymentRequired, type PaidAuditBody };
