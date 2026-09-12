// API adapter. The ONLY place that talks to the backend or provides demo data, so the
// rest of the UI never hardcodes values and the real endpoints are trivial to wire.
//
// REAL: runAudit() → POST /api/audit (Lute's actual reconciler backend).
// DEMO: everything under `demo` is product-vision data for capabilities the backend
//       does not implement yet (build/repair/deploy gate/monitoring/incidents). It is
//       clearly namespaced and must never be presented to users as live production data.

import type {
  AuditReport, DeploymentGate, Incident, IntegrityPack, MonitorRow, VerificationRunRow, VerificationStage,
} from "./types";

export type RunAuditParams = {
  contract: string;
  event?: "Deposit" | "Withdraw";
  fromBlock: string | number;
  toBlock: string | number;
  subgraph?: string;
};

/** REAL backend call. Throws on network/HTTP error so callers can render an error state. */
export async function runAudit(params: RunAuditParams): Promise<AuditReport> {
  const res = await fetch("/api/audit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "Deposit", subgraph: "morpho", ...params }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `audit failed (${res.status})`);
  return body as AuditReport;
}

export const IS_DEMO = true;

// ---- demo fixtures (product vision; not live) --------------------------------------
export const demo = {
  pipeline(): VerificationStage[] {
    return [
      { key: "build", label: "Build", state: "PASSED", timing: "32s", detail: "Compile and generate artifacts" },
      { key: "verify", label: "Verify", state: "PASSED", timing: "1m 12s", detail: "AI and rule-based verification" },
      { key: "repair", label: "Repair", state: "PASSED", timing: "28s", detail: "No issues found" },
      { key: "deploy", label: "Deploy", state: "PASSED", timing: "—", detail: "Verified and approved" },
    ];
  },
  gate(): DeploymentGate {
    return {
      state: "ALLOWED",
      candidateHash: "3a4f2c1e9d8a7c22",
      verifiedHash: "3a4f2c1e9d8a7c22",
      integrityPack: "erc4626@1",
      testCoverage: "96.4%",
      policyCompliance: "Pass",
      finalVerdict: "VERIFIED",
    };
  },
  packs(): IntegrityPack[] {
    return [
      { id: "erc4626", name: "ERC-4626", version: "erc4626@1", standard: "Tokenized Vault", status: "STABLE",
        strongChecks: ["event_count", "event_presence", "field_accuracy", "duplicate_detection"],
        conditionalChecks: ["block_provenance", "transaction_provenance"],
        fields: ["Deposit", "Withdraw", "assets", "shares", "owner", "receiver"] },
      { id: "amm", name: "AMM / LP", version: "amm@1", standard: "Automated Market Maker", status: "COMING_SOON",
        strongChecks: ["swap_reconciliation", "reserve_provenance"], conditionalChecks: ["lp_supply"],
        fields: ["Swap", "Mint", "Burn", "amount0", "amount1"] },
    ];
  },
  recentRuns(): VerificationRunRow[] {
    return [
      { project: "edge-market-subgraph", pack: "erc4626@1", verdict: "VERIFIED", coverage: "96.4%", updated: "12m ago" },
      { project: "lending-protocol", pack: "defi@2", verdict: "VERIFIED", coverage: "94.1%", updated: "2h ago" },
      { project: "nft-marketplace", pack: "graph@1", verdict: "UNVERIFIED", coverage: "89.3%", updated: "5h ago" },
      { project: "governance-subgraph", pack: "dao@1", verdict: "VERIFIED", coverage: "97.2%", updated: "1d ago" },
      { project: "payments-indexer", pack: "payments@1", verdict: "VERIFIED", coverage: "93.6%", updated: "2d ago" },
    ];
  },
  incidents(): Incident[] {
    return [
      { title: "Schema mismatch in event", project: "edge-market-subgraph", severity: "SEV-2", age: "12m ago" },
      { title: "RPC latency elevated", project: "lending-protocol", severity: "SEV-3", age: "3h ago" },
      { title: "Data source failed", project: "nft-marketplace", severity: "SEV-3", age: "1d ago" },
    ];
  },
  monitoring(): MonitorRow[] {
    return [
      { label: "Graph Deployments", state: "Healthy", value: "99.9%" },
      { label: "RPC Health", state: "Healthy", value: "99.8%" },
      { label: "Substreams State", state: "Synced", value: "100%" },
      { label: "Attestation Service", state: "Healthy", value: "99.9%" },
    ];
  },
  stats(): { key: string; label: string; value: string; delta: string; tone: "up" | "warn" | "muted" }[] {
    return [
      { key: "verified", label: "Verified Deployments", value: "24", delta: "+3 this week", tone: "up" },
      { key: "incidents", label: "Active Incidents", value: "1", delta: "+1 since last week", tone: "warn" },
      { key: "integrity", label: "Integrity Coverage", value: "96.4%", delta: "+2.1%", tone: "up" },
      { key: "last", label: "Last Verification", value: "12m ago", delta: "Build #4287", tone: "muted" },
    ];
  },
  divergence(): { block: string; tx: string; log: number; expected: string; indexed: string; explanation: string; violation: string } {
    return {
      block: "20,123,456",
      tx: "0x8f3c…2a9d1e",
      log: 12,
      expected: "Transfer(address,uint256)",
      indexed: "Transfer(address,uint128)",
      explanation: "Amount type mismatch in event indexing. Detected by the schema verifier.",
      violation: "SCHEMA_MISMATCH",
    };
  },
  manifest(): { json: string; summary: { k: string; v: string; badge?: boolean }[] } {
    return {
      json: [
        "{",
        '  "name": "edge-market-subgraph",',
        '  "version": "1.0.3",',
        '  "commit": "3a4f2c1e9d8a7...",',
        '  "integrityPack": "erc4626@1",',
        '  "blockRange": "51115000-51125000",',
        '  "eventsChecked": 1842,',
        '  "verdict": "VERIFIED",',
        '  "evidenceRoot": "ipfs://bafy..."',
        "}",
      ].join("\n"),
      summary: [
        { k: "Candidate Hash", v: "3a4f2c1e9d8a7…" },
        { k: "Integrity Pack", v: "erc4626@1" },
        { k: "Test Coverage", v: "96.4%" },
        { k: "Policy Compliance", v: "Pass", badge: true },
        { k: "Final Verdict", v: "Verified", badge: true },
      ],
    };
  },
};
