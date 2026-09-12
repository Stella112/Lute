import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildCandidateManifest } from "../src/candidate.js";
import { buildErc4626 } from "../src/build.js";
import { applyKnownErc4626Repair, createRepairContext } from "../src/repair.js";
import { createVerificationRun } from "../src/run-store.js";
import type { AuditReport } from "../src/types.js";

const CONTRACT = "0x1234567890123456789012345678901234567890";

function template(): string {
  const dir = mkdtempSync(join(tmpdir(), "lute-template-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "abis"), { recursive: true });
  writeFileSync(join(dir, "subgraph.honest.yaml"), `specVersion: 1.0.0\ndataSources:\n  - network: base\n    source:\n      address: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183"\n      startBlock: 1\n`);
  writeFileSync(join(dir, "schema.graphql"), "type DepositEvent @entity { id: String! }\n");
  writeFileSync(join(dir, "src", "mapping.ts"), "export function handleDeposit(): void {}\n");
  writeFileSync(join(dir, "abis", "ERC4626.json"), "[]\n");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { build: "graph build subgraph.honest.yaml" } }));
  return dir;
}

test("build workflow scaffolds and hashes an honest Base ERC-4626 candidate", async () => {
  const source = template();
  const output = mkdtempSync(join(tmpdir(), "lute-build-"));
  try {
    const result = await buildErc4626({
      intent: `Build an ERC-4626 indexer on Base for ${CONTRACT}`,
      startBlock: "123",
      outputDir: join(output, "candidate"),
      templateDir: source,
      compile: false,
    });
    assert.equal(result.contract, CONTRACT);
    assert.equal(result.startBlock, "123");
    assert.match(result.candidate.candidateHash, /^[0-9a-f]{64}$/);
    assert.equal(result.stages.at(-1)?.status, "SKIPPED");
    const manifest = readFileSync(join(result.candidateDir, "subgraph.yaml"), "utf8");
    assert.match(manifest, new RegExp(`address: "${CONTRACT}"`));
    assert.match(manifest, /startBlock: 123/);
    assert.equal(readFileSync(join(result.candidateDir, "package.json"), "utf8").includes("subgraph.honest.yaml"), false);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(output, { recursive: true, force: true });
  }
});

test("repair context is evidence-bound and known identity repair changes the candidate", () => {
  const candidateDir = mkdtempSync(join(tmpdir(), "lute-repair-"));
  try {
    mkdirSync(join(candidateDir, "src"), { recursive: true });
    writeFileSync(join(candidateDir, "subgraph.yaml"), "network: base\n");
    writeFileSync(join(candidateDir, "schema.graphql"), "type DepositEvent @entity { id: String! }\n");
    writeFileSync(join(candidateDir, "src", "mapping.ts"), [
      "export function handleDeposit(event: any): void {",
      "  let id = event.block.number.toString();",
      "  save(id);",
      "}",
    ].join("\n"));
    const report: AuditReport = {
      runId: "run-repair-1",
      target: { type: "EXTERNAL_AUDIT", network: "base", contract: CONTRACT, subgraph: "local:block-id" },
      event: "Deposit",
      range: { startBlock: "1", endBlock: "2", safeHead: "2" },
      verdict: "FAILED",
      checks: [{ name: "event_presence", class: "STRONG", status: "FAIL", detail: "missing event" }],
      eventsChecked: 1,
      rawEvidence: { network: "base", contract: CONTRACT, topic0: "0x", startBlock: "1", endBlock: "2", rpcAlias: "test", chunkCount: 1, eventCount: 1 },
      subgraphEvidence: { endpoint: "test", entity: "DepositEvent", blockFilters: "1-2", pageCount: 1, recordCount: 0 },
      firstDivergence: { blockNumber: "1", transactionHash: "0xabc", logIndex: 0, event: "Deposit", check: "event_presence", expectedSource: "RAW_RPC", observedSource: "SUBGRAPH", raw: { assets: "1" }, indexed: null },
    };
    const candidate = buildCandidateManifest(candidateDir);
    const run = createVerificationRun({ report, candidate, evidenceRoot: "root" });
    const context = createRepairContext(run);
    assert.deepEqual(context.failedChecks, ["event_presence"]);
    assert.deepEqual(context.canonicalObservation, { assets: "1" });
    assert.ok(context.relevantFiles.includes("src/mapping.ts"));
    const before = candidate.candidateHash;
    assert.equal(applyKnownErc4626Repair(candidateDir).changed, true);
    assert.notEqual(buildCandidateManifest(candidateDir).candidateHash, before);
    assert.match(readFileSync(join(candidateDir, "src", "mapping.ts"), "utf8"), /event\.transaction\.hash/);
  } finally {
    rmSync(candidateDir, { recursive: true, force: true });
  }
});
