// Offline tests for the public Hedera paid-audit boundary.
// These tests intentionally do not call Blocky402 or spend testnet funds.

import { test } from "node:test";
import assert from "node:assert/strict";

import { quote } from "../src/paid/quote.js";
import { buildPaymentRequired } from "../src/paid/server.js";
import { buildPaymentPayload } from "../src/paid/payment-payload.js";
import { PaidRequestError, parsePaidAuditBody } from "../src/paid/validation.js";

const CONTRACT = "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183";

test("paid request validation applies safe defaults and preserves bigint blocks", () => {
  const request = parsePaidAuditBody("{}");
  assert.equal(request.contract, CONTRACT);
  assert.equal(request.event, "Deposit");
  assert.equal(request.fromBlock, 51115000n);
  assert.equal(request.toBlock, 51125000n);
  assert.equal(request.subgraph, "morpho");
});

test("paid request validation rejects malformed, reversed, unsafe, and oversized ranges", () => {
  assert.throws(() => parsePaidAuditBody("not-json"), PaidRequestError);
  assert.throws(() => parsePaidAuditBody(JSON.stringify({ contract: "0x1" })), PaidRequestError);
  assert.throws(() => parsePaidAuditBody(JSON.stringify({ fromBlock: 9007199254740992 })), PaidRequestError);
  assert.throws(() => parsePaidAuditBody(JSON.stringify({ fromBlock: "20", toBlock: "19" })), PaidRequestError);
  assert.throws(
    () => parsePaidAuditBody(JSON.stringify({ fromBlock: "1", toBlock: "100001" })),
    (error: unknown) => error instanceof PaidRequestError && error.status === 413,
  );
});

test("paid request validation blocks caller-controlled graph-node URLs", () => {
  assert.throws(
    () => parsePaidAuditBody(JSON.stringify({ subgraph: "graphnode:https://169.254.169.254/latest/meta-data" })),
    /URLs are not allowed/,
  );
  assert.doesNotThrow(() => parsePaidAuditBody(JSON.stringify({ subgraph: "graphnode:lute/steak-honest" })));
});

test("quote has deterministic boundary tiers and rejects invalid ranges", () => {
  assert.deepEqual(quote(10n, 10n), { tier: "quick", hbar: 0.5, tinybars: "50000000", blocks: 1 });
  assert.equal(quote(1n, 2000n).tier, "quick");
  assert.equal(quote(1n, 2001n).tier, "standard");
  assert.equal(quote(1n, 20001n).tier, "deep");
  assert.throws(() => quote(2n, 1n), /invalid block range/);
});

test("paid server emits an x402 v2 payment-required header", () => {
  const requirements = {
    scheme: "exact" as const,
    network: "hedera:testnet",
    amount: "50000000",
    payTo: "0.0.123",
    maxTimeoutSeconds: 300,
    asset: "0.0.0",
  };
  const resource = "https://uselute.xyz/v1/paid/audits";
  const paymentRequired = buildPaymentRequired(resource, "payment required", requirements);
  assert.equal(paymentRequired.body.x402Version, 2);
  assert.equal(paymentRequired.body.resource.url, resource);
  assert.deepEqual(JSON.parse(Buffer.from(paymentRequired.header, "base64").toString("utf8")), paymentRequired.body);
});

test("paid agent preserves the x402 resource binding in its payment payload", () => {
  const paymentPayload = buildPaymentPayload(
    {
      x402Version: 2,
      resource: {
        url: "https://uselute.xyz/v1/paid/audits",
        description: "Lute audit",
        mimeType: "application/json",
      },
    },
    {
      scheme: "exact",
      network: "hedera:testnet",
      amount: "50000000",
      payTo: "0.0.123",
      asset: "0.0.0",
      extra: { feePayer: "0.0.456" },
    },
    { transaction: "signed-transaction-bytes" },
  );

  assert.equal(paymentPayload.x402Version, 2);
  assert.deepEqual(paymentPayload.resource, {
    url: "https://uselute.xyz/v1/paid/audits",
    description: "Lute audit",
    mimeType: "application/json",
  });
  assert.deepEqual(paymentPayload.accepted, {
    scheme: "exact",
    network: "hedera:testnet",
    amount: "50000000",
    payTo: "0.0.123",
    asset: "0.0.0",
    extra: { feePayer: "0.0.456" },
  });
  assert.deepEqual(paymentPayload.payload, { transaction: "signed-transaction-bytes" });
});
