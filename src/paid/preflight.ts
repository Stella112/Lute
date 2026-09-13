#!/usr/bin/env node
// Non-spending Hedera x402 preflight. This intentionally stops before Blocky402
// /settle: it validates the configured payer key, builds the same partially signed
// TransferTransaction as the paid agent, and checks the payer signature against the
// Hedera Mirror Node.

import {
  createClientHederaSigner,
  createHederaVerifyPayerSignature,
  inspectHederaTransaction,
  PrivateKey,
  ExactHederaScheme,
} from "@x402/hedera";

const PAID_URL = (process.env.PAID_URL ?? "http://127.0.0.1:8793").replace(/\/$/, "");
const MIRROR = "https://testnet.mirrornode.hedera.com";

type AccountResponse = { balance?: { balance?: number }; key?: { _type?: string; key?: string } };

async function main(): Promise<void> {
  const accountId = process.env.HEDERA_AGENT_ID;
  const privateKeyText = process.env.HEDERA_AGENT_KEY;
  if (!accountId || !privateKeyText || privateKeyText.includes("PASTE_")) {
    throw new Error("set HEDERA_AGENT_ID and HEDERA_AGENT_KEY in the ignored environment");
  }

  const account = await fetch(`${MIRROR}/api/v1/accounts/${encodeURIComponent(accountId)}`).then(async (res) => {
    if (!res.ok) throw new Error(`Mirror Node account lookup HTTP ${res.status}`);
    return res.json() as Promise<AccountResponse>;
  });
  const privateKey = PrivateKey.fromString(privateKeyText);
  const derivedPublicKey = privateKey.publicKey.toStringRaw().toLowerCase();
  const mirrorPublicKey = account.key?.key?.toLowerCase() ?? "";

  const challengeResponse = await fetch(`${PAID_URL}/v1/paid/audits`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contract: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183",
      event: "Deposit",
      fromBlock: 51115000,
      toBlock: 51115100,
      subgraph: "morpho",
    }),
  });
  if (challengeResponse.status !== 402) throw new Error(`expected 402 challenge, got HTTP ${challengeResponse.status}`);
  const challenge = (await challengeResponse.json()) as { accepts?: Record<string, unknown>[] };
  const requirements = challenge.accepts?.[0];
  if (!requirements) throw new Error("402 challenge did not contain payment requirements");

  const signer = createClientHederaSigner(accountId, privateKey, { network: "hedera:testnet" });
  const scheme = new ExactHederaScheme(signer);
  const payment = await scheme.createPaymentPayload(2, requirements as never);
  const transaction = payment.payload.transaction as string;
  const inspected = inspectHederaTransaction(transaction);
  const signature = await createHederaVerifyPayerSignature()({
    payer: accountId,
    transaction,
    network: "hedera:testnet",
  });

  const result = {
    payer: accountId,
    accountKeyType: account.key?._type ?? "unknown",
    derivedKeyMatchesMirror: derivedPublicKey === mirrorPublicKey,
    balanceTinybar: account.balance?.balance ?? null,
    challenge: {
      network: requirements.network,
      asset: requirements.asset,
      amount: requirements.amount,
      payTo: requirements.payTo,
      feePayer: (requirements.extra as { feePayer?: string } | undefined)?.feePayer ?? null,
    },
    transaction: {
      type: inspected.transactionType,
      feePayer: inspected.transactionIdAccountId,
      hbarTransfers: inspected.hbarTransfers,
      payerSignatureValid: signature.ok,
    },
    spendingPerformed: false,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.derivedKeyMatchesMirror || !result.transaction.payerSignatureValid) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`preflight error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
