// Portable Integrity Pack support.
//
// The pack definition is deliberately kept as a small, reviewable YAML file in
// integrity-packs/. This module is the runtime SDK boundary: it loads and validates
// the pack, creates a portable evidence artifact, and assigns stable lineage ids so
// a judge or downstream agent can consume the result without reading Lute internals.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { VerificationRun } from "./run-store.js";

export type IntegrityPackManifest = {
  id: string;
  version: string;
  standard: string;
  supportedChains: string[];
  requiredSources: string[];
  events: string[];
  strongChecks: string[];
  conditionalChecks: string[];
  policies: { failClosed: boolean; requireFinalizedRange: boolean };
  unsupportedClaims: string[];
};

export type PaymentReceipt = {
  protocol: "x402";
  facilitator: string;
  network: string;
  transaction?: string;
  payer?: string;
  payTo?: string;
  feePayer?: string;
  amount?: string;
  asset?: string;
  tier?: string;
};

export type LineageNode = {
  id: string;
  type: "verification_run" | "candidate" | "source" | "check" | "divergence" | "verdict";
  label: string;
  source?: string;
};

export type IntegrityPackArtifact = {
  schemaVersion: 1;
  pack: IntegrityPackManifest;
  trustManifest: {
    schemaVersion: 1;
    verificationRunId: string;
    candidateHash: string;
    evidenceRoot: string;
    verdict: VerificationRun["verdict"];
    issuedAt: string;
    revoked: boolean;
    subject: VerificationRun["report"]["target"] & {
      event: string;
      range: VerificationRun["report"]["range"];
    };
    sourcesComplete: boolean;
  };
  verification: {
    runId: string;
    verifierVersion: string;
    verifierCommit: string;
    coverage: VerificationRun["coverage"];
    report: VerificationRun["report"];
  };
  candidate: {
    hash: string;
    manifest: VerificationRun["candidate"];
  };
  evidence: {
    root: string;
    lineage: LineageNode[];
  };
  payment?: PaymentReceipt;
};

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACK_ROOT = process.env.LUTE_INTEGRITY_PACKS_DIR ?? join(APP_ROOT, "integrity-packs");

function scalar(value: string): string | boolean | string[] {
  const trimmed = value.trim();
  if (trimmed === "[]") return [];
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed;
}

/** Parse the intentionally small pack.yaml format without a runtime YAML dependency. */
function parsePackYaml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let listKey: string | null = null;
  let nested: Record<string, unknown> | null = null;

  for (const original of raw.split(/\r?\n/)) {
    const line = original.trimEnd();
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (line.startsWith("  - ") && listKey) {
      (result[listKey] as unknown[]).push(scalar(trimmed.slice(2).trim()));
      continue;
    }
    if (line.startsWith("  ") && !line.startsWith("  - ") && nested) {
      const match = /^\s{2}([A-Za-z][A-Za-z0-9_]*):\s*(.+)$/.exec(line);
      if (!match) throw new Error(`invalid Integrity Pack YAML line: ${line}`);
      nested[match[1]!] = scalar(match[2]!);
      continue;
    }

    const match = /^([A-Za-z][A-Za-z0-9_]*):(?:\s*(.*))?$/.exec(line);
    if (!match) throw new Error(`invalid Integrity Pack YAML line: ${line}`);
    const key = match[1]!;
    const value = match[2]?.trim() ?? "";
    if (!value) {
      const next: unknown[] = [];
      result[key] = next;
      listKey = key;
      nested = null;
    } else {
      result[key] = scalar(value);
      listKey = null;
      nested = null;
    }
    if (key === "policies" && !value) {
      const policies: Record<string, unknown> = {};
      result[key] = policies;
      nested = policies;
      listKey = null;
    }
  }
  return result;
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Integrity Pack ${name} must be a non-empty string`);
  return value;
}

function stringList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`Integrity Pack ${name} must be a string list`);
  return value as string[];
}

export function loadErc4626Pack(): IntegrityPackManifest {
  const path = join(PACK_ROOT, "erc4626", "pack.yaml");
  const parsed = parsePackYaml(readFileSync(path, "utf8"));
  const policies = parsed.policies;
  if (!policies || typeof policies !== "object" || Array.isArray(policies)) throw new Error("Integrity Pack policies are required");
  const policy = policies as Record<string, unknown>;
  const manifest: IntegrityPackManifest = {
    id: stringField(parsed.id, "id"),
    version: stringField(parsed.version, "version"),
    standard: stringField(parsed.standard, "standard"),
    supportedChains: stringList(parsed.supportedChains, "supportedChains"),
    requiredSources: stringList(parsed.requiredSources, "requiredSources"),
    events: stringList(parsed.events, "events"),
    strongChecks: stringList(parsed.strongChecks, "strongChecks"),
    conditionalChecks: stringList(parsed.conditionalChecks, "conditionalChecks"),
    policies: {
      failClosed: policy.failClosed === true,
      requireFinalizedRange: policy.requireFinalizedRange === true,
    },
    unsupportedClaims: stringList(parsed.unsupportedClaims, "unsupportedClaims"),
  };
  if (manifest.id !== "erc4626" || manifest.version !== "1" || manifest.standard !== "ERC-4626") {
    throw new Error("unsupported Integrity Pack identity");
  }
  if (!manifest.policies.failClosed || !manifest.policies.requireFinalizedRange) {
    throw new Error("ERC-4626 Integrity Pack must be fail-closed and finalized-range safe");
  }
  return manifest;
}

function lineageFor(run: VerificationRun): LineageNode[] {
  const prefix = run.runId;
  const nodes: LineageNode[] = [
    { id: `${prefix}:run`, type: "verification_run", label: "VerificationRun" },
    { id: `${prefix}:candidate:${run.candidateHash}`, type: "candidate", label: "Candidate manifest" },
    { id: `${prefix}:source:raw-rpc`, type: "source", label: "Raw chain evidence", source: "RAW_RPC" },
    { id: `${prefix}:source:index`, type: "source", label: "Indexed candidate evidence", source: "SUBGRAPH" },
  ];
  for (const check of run.report.checks) {
    nodes.push({ id: `${prefix}:check:${check.name}`, type: "check", label: `${check.name} · ${check.status}` });
  }
  if (run.report.firstDivergence) {
    const d = run.report.firstDivergence;
    nodes.push({ id: `${prefix}:divergence:${d.blockNumber}:${d.logIndex}`, type: "divergence", label: `First divergence at ${d.blockNumber}:${d.logIndex}` });
  }
  nodes.push({ id: `${prefix}:verdict:${run.verdict}`, type: "verdict", label: run.verdict });
  return nodes;
}

export function createIntegrityPackArtifact(run: VerificationRun, payment?: PaymentReceipt): IntegrityPackArtifact {
  const pack = loadErc4626Pack();
  return {
    schemaVersion: 1,
    pack,
    trustManifest: {
      schemaVersion: 1,
      verificationRunId: run.runId,
      candidateHash: run.candidateHash,
      evidenceRoot: run.evidenceRoot,
      verdict: run.verdict,
      issuedAt: run.createdAt,
      revoked: run.revoked,
      subject: { ...run.report.target, event: run.report.event, range: run.report.range },
      sourcesComplete: run.coverage.sourcesComplete,
    },
    verification: {
      runId: run.runId,
      verifierVersion: run.verifierVersion,
      verifierCommit: run.verifierCommit,
      coverage: run.coverage,
      report: run.report,
    },
    candidate: { hash: run.candidateHash, manifest: run.candidate },
    evidence: { root: run.evidenceRoot, lineage: lineageFor(run) },
    ...(payment ? { payment } : {}),
  };
}
