#!/usr/bin/env node
// Demo consumer agent (contract §48). Proves the buyer side of the marketplace: it
// requests a paid Lute audit, receives HTTP 402, pays real HBAR on Hedera testnet via
// Blocky402 (using @x402/fetch + the Hedera exact scheme), retries, and receives the
// actual verification verdict + evidence + the on-chain payment receipt.
//
// Env: HEDERA_OPERATOR_ID/HEDERA_OPERATOR_KEY (funds a one-time agent account if
// HEDERA_AGENT_ID/HEDERA_AGENT_KEY are not set), PAID_URL (default http://localhost:8793).

import { Client, PrivateKey, Hbar, AccountBalanceQuery } from "@x402/hedera";
import { AccountCreateTransaction } from "@hiero-ledger/sdk";
import { ExactHederaScheme, createClientHederaSigner } from "@x402/hedera";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";

const PAID_URL = (process.env.PAID_URL ?? "http://localhost:8793").replace(/\/$/, "");

function operatorClient(): Client {
  const id = process.env.HEDERA_OPERATOR_ID;
  const key = process.env.HEDERA_OPERATOR_KEY;
  if (!id || !key || key.includes("PASTE_")) throw new Error("set HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY in .env");
  return Client.forTestnet().setOperator(id, PrivateKey.fromStringECDSA(key));
}

async function ensureAgent(): Promise<{ id: string; key: string }> {
  const envId = process.env.HEDERA_AGENT_ID;
  const envKey = process.env.HEDERA_AGENT_KEY;
  if (envId && envKey && !envKey.includes("PASTE_")) return { id: envId, key: envKey };

  process.stderr.write("no HEDERA_AGENT_* set — creating a funded testnet agent account via the operator…\n");
  const op = operatorClient();
  try {
    const agentKey = PrivateKey.generateECDSA();
    const tx = await new AccountCreateTransaction()
      .setKeyWithoutAlias(agentKey.publicKey)
      .setInitialBalance(new Hbar(20))
      .execute(op);
    const receipt = await tx.getReceipt(op);
    const id = receipt.accountId!.toString();
    const key = agentKey.toStringRaw();
    // Never print the generated private key. This account is usable for this one
    // process; operators who want to reuse it must provision the key through their
    // local secret manager or ignored environment file themselves.
    process.stderr.write(`created agent account ${id} for this run; the private key was not logged\n`);
    return { id, key };
  } finally {
    op.close();
  }
}

async function main() {
  const agent = await ensureAgent();
  const payTo = process.env.HEDERA_OPERATOR_ID;
  if (payTo && agent.id === payTo) {
    throw new Error("HEDERA_AGENT_ID must be a separate Hedera account from HEDERA_OPERATOR_ID/payTo");
  }
  // NOTE: the signer's `network` must be the CAIP-2 id ("hedera:testnet"); the SDK
  // network name ("testnet") is rejected by assertSupportedHederaNetwork.
  // Do not force the payer key to ECDSA. Hedera testnet accounts may use either
  // ECDSA_SECP256K1 or ED25519, and PrivateKey.fromString safely preserves the
  // actual key type. The facilitator verifies this signature against Mirror Node.
  const agentPrivateKey = PrivateKey.fromString(agent.key);
  const signer = createClientHederaSigner(agent.id, agentPrivateKey, { network: "hedera:testnet" });
  const paymentClient = new x402Client()
    .register("hedera:testnet", new ExactHederaScheme(signer))
    // HBAR is intentionally not a default asset in the generic SDK because it
    // cannot be USD-priced automatically. Opt in explicitly and cap this demo
    // client at the service's maximum 2 HBAR quote.
    .setSpendControls({
      maxAmountPerPayment: false,
      allowedAssets: [{ network: "hedera:testnet", asset: "0.0.0", maxAmountPerPayment: "200000000" }],
    });
  const paidFetch = wrapFetchWithPayment(globalThis.fetch, paymentClient);
  const url = `${PAID_URL}/v1/paid/audits`;
  const body = JSON.stringify({ contract: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183", event: "Deposit", fromBlock: 51115000, toBlock: 51125000, subgraph: "morpho" });

  // balance before
  const payerClient = Client.forTestnet().setOperator(agent.id, agentPrivateKey);
  try {
    const bal = await new AccountBalanceQuery().setAccountId(agent.id).execute(payerClient);
    process.stderr.write(`agent ${agent.id} balance: ${bal.hbars.toString()}\n`);
  } finally {
    payerClient.close();
  }

  // The official x402 fetch wrapper performs the exact three-step flow:
  // request -> 402 requirements -> partially signed Hedera transfer -> retry.
  // The resource server then verifies, runs the audit, and settles via Blocky402.
  process.stderr.write(`requesting paid audit at ${url} …\n`);
  const response = await paidFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const json = await response.json();
  const settleHeader = response.headers.get("payment-response") ?? response.headers.get("x-payment-response");
  const settlement = settleHeader ? JSON.parse(Buffer.from(settleHeader, "base64").toString("utf8")) : null;

  console.log(JSON.stringify({ status: response.status, result: json, settlement }, null, 2));
}

main().catch((e) => { process.stderr.write(`agent error: ${(e as Error).message}\n`); process.exitCode = 1; });
