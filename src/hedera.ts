// Hedera Consensus Service (HCS) attestation publisher.
//
// Publishes a compact, immutable, timestamped attestation of an audit verdict to an HCS
// topic. `buildAttestation` is a pure function (offline-testable); `publishAttestation`
// creates/uses a topic and submits the message using operator credentials from env.
//
// Credentials come from env (never logged): HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY,
// HEDERA_NETWORK (testnet|mainnet), optional HEDERA_TOPIC_ID (reuse an existing topic).

import type { AuditReport } from "./types.js";

export type Attestation = {
  app: "lute";
  kind: "reconciliation-audit";
  verdict: string;
  network: string;
  contract: string;
  event: string;
  range: { startBlock: string; endBlock: string };
  counts: { raw: number | null; subgraph: number | null };
  firstDivergence:
    | { blockNumber: string; transactionHash: string; logIndex: number; check: string }
    | null;
  runId: string;
  ts: string;
};

/** Pure: reduce an AuditReport to a compact attestation payload. */
export function buildAttestation(report: AuditReport, now: () => string = () => new Date().toISOString()): Attestation {
  const d = report.firstDivergence;
  return {
    app: "lute",
    kind: "reconciliation-audit",
    verdict: report.verdict,
    network: report.target.network,
    contract: report.target.contract,
    event: report.event,
    range: { startBlock: report.range.startBlock, endBlock: report.range.endBlock },
    counts: {
      raw: report.rawEvidence?.eventCount ?? null,
      subgraph: report.subgraphEvidence?.recordCount ?? null,
    },
    firstDivergence: d
      ? { blockNumber: d.blockNumber, transactionHash: d.transactionHash, logIndex: d.logIndex, check: d.check }
      : null,
    runId: report.runId,
    ts: now(),
  };
}

export type HederaConfig = {
  network?: string;
  operatorId?: string;
  operatorKey?: string;
  topicId?: string;
};

export type PublishResult = {
  topicId: string;
  sequenceNumber: string;
  transactionId: string;
  hashscan: string;
  message: string;
};

export function isHederaConfigured(cfg: HederaConfig = {}): boolean {
  const id = cfg.operatorId ?? process.env.HEDERA_OPERATOR_ID;
  const key = cfg.operatorKey ?? process.env.HEDERA_OPERATOR_KEY;
  return Boolean(id && key && !key.includes("PASTE_"));
}

/** Publish the attestation to HCS. Creates a topic if none is configured. */
export async function publishAttestation(report: AuditReport, cfg: HederaConfig = {}): Promise<PublishResult> {
  const network = cfg.network ?? process.env.HEDERA_NETWORK ?? "testnet";
  const operatorId = cfg.operatorId ?? process.env.HEDERA_OPERATOR_ID;
  const operatorKey = cfg.operatorKey ?? process.env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKey || operatorKey.includes("PASTE_")) {
    throw new Error("Hedera not configured: set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY (see .env)");
  }

  const { Client, PrivateKey, TopicCreateTransaction, TopicMessageSubmitTransaction } = await import("@hashgraph/sdk");
  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();

  // The portal's "HEX Encoded Private Key" is ECDSA for EVM-address accounts; fall back to ED25519.
  let key;
  try {
    key = PrivateKey.fromStringECDSA(operatorKey);
  } catch {
    key = PrivateKey.fromStringED25519(operatorKey);
  }
  client.setOperator(operatorId, key);

  try {
    let topicId = cfg.topicId ?? process.env.HEDERA_TOPIC_ID;
    if (!topicId) {
      const created = await new TopicCreateTransaction().setTopicMemo("Lute audit attestations").execute(client);
      const receipt = await created.getReceipt(client);
      topicId = receipt.topicId!.toString();
    }
    const message = JSON.stringify(buildAttestation(report));
    const submit = await new TopicMessageSubmitTransaction({ topicId, message }).execute(client);
    const receipt = await submit.getReceipt(client);
    return {
      topicId,
      sequenceNumber: receipt.topicSequenceNumber?.toString() ?? "?",
      transactionId: submit.transactionId.toString(),
      hashscan: `https://hashscan.io/${network}/topic/${topicId}`,
      message,
    };
  } finally {
    client.close();
  }
}
