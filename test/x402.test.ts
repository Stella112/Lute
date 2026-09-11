// x402 gating: offline checks of the payment-requirements builder and the 402 challenge.
// The paid path (verify/settle via a facilitator + a funded client) is not exercised here.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildRequirements } from "../src/x402-server.js";
import { PaymentRequirementsSchema } from "x402/types";

const PAY_TO = "0x1234567890123456789012345678901234567890";

test("buildRequirements produces valid x402 'exact' requirements", () => {
  const [req] = buildRequirements("http://localhost:8789/audit", {
    price: "$0.01",
    network: "base-sepolia",
    payTo: PAY_TO,
  });
  // must satisfy the x402 schema
  assert.doesNotThrow(() => PaymentRequirementsSchema.parse(req));
  assert.equal(req!.scheme, "exact");
  assert.equal(req!.network, "base-sepolia");
  assert.equal(req!.payTo, PAY_TO);
  assert.equal(req!.resource, "http://localhost:8789/audit");
  // $0.01 of a 6-decimals USDC == 10000 atomic units
  assert.equal(req!.maxAmountRequired, "10000");
  assert.match(req!.asset, /^0x[0-9a-fA-F]{40}$/);
});

test("buildRequirements supports Base mainnet too", () => {
  const [req] = buildRequirements("http://x/audit", { price: "$0.05", network: "base", payTo: PAY_TO });
  assert.equal(req!.network, "base");
  assert.equal(req!.maxAmountRequired, "50000"); // 0.05 * 1e6
});
