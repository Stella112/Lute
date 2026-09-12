// Lute domain types. These model the product's verification vocabulary; the fields
// that come from the real backend (AuditReport) are marked as such.

export type Verdict = "VERIFIED" | "FAILED" | "INCONCLUSIVE" | "UNVERIFIED" | "UNAVAILABLE";
export type PackSupport = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED";
export type DeploymentState = "ALLOWED" | "BLOCKED" | "STALE" | "REVOKED" | "INCOMPLETE";
export type StageState = "WAITING" | "RUNNING" | "PASSED" | "FAILED" | "BLOCKED" | "SKIPPED";
export type CheckStatus = "PASS" | "FAIL" | "UNVERIFIED" | "INCONCLUSIVE" | "UNAVAILABLE";

/** Shape returned by the REAL backend (src/audit.ts → /api/audit). */
export type AuditReport = {
  runId: string;
  target: { type: string; network: string; contract: string; subgraph: string };
  event: string;
  range: { startBlock: string; endBlock: string; safeHead: string };
  verdict: Extract<Verdict, "VERIFIED" | "FAILED" | "INCONCLUSIVE">;
  checks: { name: string; class: string; status: CheckStatus; detail?: string }[];
  eventsChecked: number;
  rawEvidence: { topic0: string; rpcAlias: string; chunkCount: number; eventCount: number } | null;
  subgraphEvidence: { endpoint: string; entity: string; pageCount: number; recordCount: number } | null;
  firstDivergence:
    | { blockNumber: string; transactionHash: string; logIndex: number; event: string; check: string; raw: Record<string, string> | null; indexed: Record<string, string> | null }
    | null;
  inconclusiveReason?: string;
};

/* ---- demo/product-vision types (backed by the demo adapter until implemented) ---- */

export type VerificationStage = { key: string; label: string; state: StageState; detail?: string; timing?: string };

export type DeploymentGate = {
  state: DeploymentState;
  candidateHash: string;
  verifiedHash: string;
  integrityPack: string;
  testCoverage: string;
  policyCompliance: "Pass" | "Fail";
  finalVerdict: Verdict;
};

export type IntegrityPack = {
  id: string;
  name: string;
  version: string;
  standard: string;
  events: string[];
  strongChecks: string[];
  conditionalChecks: string[];
  unsupportedClaims: string[];
  status: "STABLE" | "BETA" | "COMING_SOON";
};

export type VerificationRunRow = { project: string; pack: string; verdict: Verdict; coverage: string; updated: string };
export type Incident = { title: string; project: string; severity: "SEV-1" | "SEV-2" | "SEV-3"; age: string };
export type MonitorRow = { label: string; state: "Healthy" | "Synced" | "Diverged" | "Degraded"; value: string };

export type DashboardSnapshot = {
  service: string;
  status: "ok";
  verifierCommit: string;
  packs: {
    id: string;
    version: string;
    standard: string;
    supportedChains: string[];
    requiredSources: string[];
    events: string[];
    strongChecks: string[];
    conditionalChecks: string[];
    unsupportedClaims: string[];
  }[];
  stats: {
    totalRuns: number;
    verifiedRuns: number;
    failedRuns: number;
    inconclusiveRuns: number;
    lastVerificationAt: string | null;
  };
  latest: VerificationRun | null;
  runs: VerificationRun[];
};

export type VerificationRun = {
  runId: string;
  candidateHash: string;
  candidate: { candidateHash: string; fileCount: number; files: { path: string; sha256: string; bytes: number }[] };
  integrityPack: { id: string; version: string };
  report: AuditReport;
  coverage: {
    strongChecksPassed: number;
    strongChecksTotal: number;
    conditionalChecksPassed: number;
    conditionalChecksTotal: number;
    eventsChecked: number;
    blocksChecked: string;
    sourcesComplete: boolean;
  };
  evidenceRoot: string;
  verdict: Verdict;
  createdAt: string;
  revoked: boolean;
};
