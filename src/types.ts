// Lute Phase 1 — shared types.
//
// Two independent event representations flow through the reconciler:
//   CanonicalEvent  — derived by Lute directly from raw Base RPC logs (the VERIFIER / ground truth).
//   IndexedEvent    — retrieved from a Subgraph-class index (the CANDIDATE being audited).
//
// They are physically separate structures. The verifier NEVER converts one into the
// other, and NEVER derives its expected values from the candidate index.

export type Network = "base";

export type Source = "RAW_RPC" | "SUBGRAPH" | "DERIVED";

/** A fact reconstructed independently from a raw chain log. This is ground truth. */
export type CanonicalEvent = {
  network: Network;
  contract: string;
  eventName: string;
  blockNumber: string; // decimal string (bigint-safe)
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  fields: Record<string, string>; // all values as strings; uint256 as decimal strings
  source: "RAW_RPC";
};

/** A record as reported by the candidate index (Subgraph / GraphQL indexer). */
export type IndexedEvent = {
  entityId: string;
  blockNumber?: string;
  transactionHash?: string;
  logIndex?: number;
  eventName: string;
  fields: Record<string, string>;
  source: "SUBGRAPH";
};

/** Canonical identity of an event: transactionHash + logIndex. Never derived from a Subgraph entity id. */
export function eventIdentity(e: {
  transactionHash?: string;
  logIndex?: number;
}): string {
  if (!e.transactionHash || e.logIndex === undefined || e.logIndex === null) {
    return "UNIDENTIFIABLE";
  }
  return `${e.transactionHash.toLowerCase()}:${e.logIndex}`;
}

export type CheckStatus = "PASS" | "FAIL" | "UNVERIFIED";

/** STRONG = an independently verifiable check whose disagreement is a real defect. */
export type CheckClass = "STRONG" | "WEAK";

export type ValueWithProvenance = {
  value: string;
  source: Source;
};

export type CheckResult = {
  name: string;
  class: CheckClass;
  status: CheckStatus;
  expected?: ValueWithProvenance; // from RAW_RPC
  observed?: ValueWithProvenance; // from SUBGRAPH
  detail?: string;
};

export type Verdict = "VERIFIED" | "FAILED" | "INCONCLUSIVE";

export type FirstDivergence = {
  blockNumber: string;
  transactionHash: string;
  logIndex: number;
  event: string;
  check: string;
  expectedSource: Source;
  observedSource: Source;
  raw: Record<string, string> | null;
  indexed: Record<string, string> | null;
} | null;

export type RawEvidence = {
  network: Network;
  contract: string;
  topic0: string;
  startBlock: string;
  endBlock: string;
  rpcAlias: string;
  chunkCount: number;
  eventCount: number;
};

export type SubgraphEvidence = {
  endpoint: string;
  entity: string;
  blockFilters: string;
  pageCount: number;
  recordCount: number;
};

export type AuditReport = {
  runId: string;
  target: {
    type: "EXTERNAL_AUDIT";
    network: Network;
    contract: string;
    subgraph: string;
  };
  event: string;
  range: {
    startBlock: string;
    endBlock: string;
    safeHead: string;
  };
  verdict: Verdict;
  checks: CheckResult[];
  eventsChecked: number;
  rawEvidence: RawEvidence | null;
  subgraphEvidence: SubgraphEvidence | null;
  firstDivergence: FirstDivergence;
  inconclusiveReason?: string;
};
