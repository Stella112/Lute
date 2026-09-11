#!/usr/bin/env node
// Lute x402-gated audit server.
//
// Serves the reconciler as a paid HTTP endpoint using the x402 protocol: a request
// without a valid `X-PAYMENT` header gets HTTP 402 + payment requirements; a request
// with one is verified and settled via an x402 facilitator, then the audit runs and the
// result is returned with an `X-PAYMENT-RESPONSE` header.
//
// Lute never moves funds: the client signs the payment, the facilitator verifies and
// broadcasts it to `payTo`. This process only builds the challenge and calls the
// facilitator's verify/settle.
//
// Config (env):
//   X402_PAY_TO           receiving address (REQUIRED to enable paid mode)
//   X402_PRICE            price per audit, e.g. "$0.01" (default) or atomic token amount
//   X402_NETWORK          "base-sepolia" (default, testable) or "base"
//   X402_FACILITATOR_URL  facilitator base URL (default https://x402.org/facilitator)
//   X402_PORT             listen port (default 8789)

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { useFacilitator } from "x402/verify";
import { decodePayment } from "x402/schemes";
import { processPriceToAtomicAmount, findMatchingPaymentRequirements } from "x402/shared";
import { NetworkSchema, PaymentRequirementsSchema, settleResponseHeader } from "x402/types";
import type { z } from "zod";

import { runAudit } from "./audit.js";
import { toJSON } from "./bigint.js";
import { newRunId, Logger } from "./logger.js";
import { resolveVerifierRpc } from "./rpc.js";
import { makeSource } from "./sources.js";

type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;

const X402_VERSION = 1;
const PORT = Number(process.env.X402_PORT ?? 8789);
const PAY_TO = process.env.X402_PAY_TO ?? "";
const PRICE = process.env.X402_PRICE ?? "$0.01";
const NETWORK = NetworkSchema.parse(process.env.X402_NETWORK ?? "base-sepolia");
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";

const facilitator = useFacilitator({ url: FACILITATOR_URL as `${string}://${string}` });

/** Build the payment requirements advertised for an audit request. Exported for tests. */
export function buildRequirements(
  resource: string,
  cfg: { price?: string; network?: string; payTo?: string } = {},
): PaymentRequirements[] {
  const network = NetworkSchema.parse(cfg.network ?? NETWORK);
  const priced = processPriceToAtomicAmount(cfg.price ?? PRICE, network);
  if ("error" in priced) throw new Error(`x402 price error: ${priced.error}`);
  const { maxAmountRequired, asset } = priced;
  const req: PaymentRequirements = {
    scheme: "exact",
    network,
    maxAmountRequired,
    resource: resource as `${string}://${string}`,
    description: "Lute reconciliation audit (RAW_RPC vs Subgraph)",
    mimeType: "application/json",
    payTo: cfg.payTo ?? PAY_TO,
    maxTimeoutSeconds: 120,
    asset: asset.address,
    extra: "eip712" in asset ? asset.eip712 : undefined,
  };
  return [PaymentRequirementsSchema.parse(req)];
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function require402(res: ServerResponse, error: string, accepts: PaymentRequirements[]) {
  send(res, 402, { x402Version: X402_VERSION, error, accepts });
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

type AuditBody = { contract?: string; event?: "Deposit" | "Withdraw"; fromBlock?: string | number; toBlock?: string | number; subgraph?: string };

async function handleAudit(req: IncomingMessage, res: ServerResponse, resource: string) {
  if (!PAY_TO) return send(res, 503, { error: "x402 not configured: set X402_PAY_TO to a receiving address" });

  const requirements = buildRequirements(resource);
  const header = req.headers["x-payment"];
  if (!header || typeof header !== "string") return require402(res, "X-PAYMENT header is required", requirements);

  let payment;
  try {
    payment = decodePayment(header);
  } catch (e) {
    return require402(res, `invalid X-PAYMENT: ${(e as Error).message}`, requirements);
  }
  const selected = findMatchingPaymentRequirements(requirements, payment) ?? requirements[0]!;

  const verification = await facilitator.verify(payment, selected);
  if (!verification.isValid) {
    return require402(res, `payment invalid: ${verification.invalidReason ?? "unknown"}`, requirements);
  }

  // Payment verified — run the audit.
  const body = JSON.parse((await readBody(req)) || "{}") as AuditBody;
  if (!body.contract || !/^0x[0-9a-fA-F]{40}$/.test(body.contract)) {
    return send(res, 400, { error: "a valid contract address is required" });
  }
  if (body.fromBlock === undefined || body.toBlock === undefined) {
    return send(res, 400, { error: "fromBlock and toBlock are required" });
  }
  const runId = newRunId();
  const logger = new Logger(runId);
  const rpc = resolveVerifierRpc(logger);
  const eventName = body.event ?? "Deposit";
  const report = await runAudit({
    rpc, contract: body.contract, eventName,
    fromBlock: BigInt(body.fromBlock), toBlock: BigInt(body.toBlock),
    subgraph: makeSource(body.subgraph ?? "morpho", body.contract, eventName, rpc),
    logger, runId,
  });

  // Settle the payment and return the result.
  const settlement = await facilitator.settle(payment, selected);
  send(res, 200, toJSON(report), { "X-PAYMENT-RESPONSE": settleResponseHeader(settlement) });
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const resource = `http://localhost:${PORT}${url.pathname}`;
  if (req.method === "POST" && url.pathname === "/audit") {
    handleAudit(req, res, resource).catch((e) => send(res, 500, { error: (e as Error).message }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/") {
    return send(res, 200, {
      service: "lute x402 audit",
      pay: { network: NETWORK, price: PRICE, payTo: PAY_TO || "(unset)", facilitator: FACILITATOR_URL },
      usage: "POST /audit with an X-PAYMENT header and a JSON body {contract,event,fromBlock,toBlock,subgraph}",
    });
  }
  send(res, 404, { error: "not found" });
});

// Only listen when run directly, not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith("x402-server.ts")) {
  server.listen(PORT, () => process.stderr.write(`lute-x402: http://localhost:${PORT} (network=${NETWORK}, payTo=${PAY_TO || "UNSET"})\n`));
}

export { server };
