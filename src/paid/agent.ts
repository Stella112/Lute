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
import { ExactHederaScheme, createClientHederaSigner, HEDERA_TESTNET_CAIP2 } from "@x402/hedera";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";

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
  const signer = createClientHederaSigner(agent.id, PrivateKey.fromStringECDSA(agent.key), { network: HEDERA_TESTNET_CAIP2 });
  const payFetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: HEDERA_TESTNET_CAIP2, client: new ExactHederaScheme(signer) }],
    spendControls: false, // paying in native HBAR (non-default asset) on testnet
  });

  // balance before
  const payerClient = Client.forTestnet().setOperator(agent.id, PrivateKey.fromStringECDSA(agent.key));
  let bal;
  try {
    bal = await new AccountBalanceQuery().setAccountId(agent.id).execute(payerClient);
  } finally {
    payerClient.close();
  }
  process.stderr.write(`agent ${agent.id} balance: ${bal.hbars.toString()}\n`);

  const body = JSON.stringify({ contract: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183", event: "Deposit", fromBlock: 51115000, toBlock: 51125000, subgraph: "morpho" });
  process.stderr.write(`requesting paid audit at ${PAID_URL}/v1/paid/audits …\n`);
  const res = await payFetch(`${PAID_URL}/v1/paid/audits`, { method: "POST", headers: { "content-type": "application/json" }, body });
  const json = await res.json();

  const settleHeader = res.headers.get("x-payment-response");
  const settlement = settleHeader ? decodePaymentResponseHeader(settleHeader) : null;

  console.log(JSON.stringify({ status: res.status, result: json, settlement }, null, 2));
}

main().catch((e) => { process.stderr.write(`agent error: ${(e as Error).message}\n`); process.exitCode = 1; });
