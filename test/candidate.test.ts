// Candidate hashing tests (contract §25 acceptance).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildCandidateManifest } from "../src/candidate.js";

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "lute-cand-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "node_modules", "x"), { recursive: true });
  writeFileSync(join(dir, "subgraph.yaml"), "specVersion: 1.0.0\n");
  writeFileSync(join(dir, "schema.graphql"), "type DepositEvent @entity(immutable: false) { id: String! }\n");
  writeFileSync(join(dir, "src", "mapping.ts"), "export function handleDeposit(): void {}\n");
  writeFileSync(join(dir, "README.md"), "docs — not execution-relevant\n");
  writeFileSync(join(dir, ".env"), "SECRET=should-not-be-hashed\n");
  writeFileSync(join(dir, "node_modules", "x", "index.js"), "junk\n");
  return dir;
}

test("candidate hash is deterministic and covers only execution-relevant files", () => {
  const dir = fixture();
  try {
    const m1 = buildCandidateManifest(dir);
    const m2 = buildCandidateManifest(dir);
    assert.equal(m1.candidateHash, m2.candidateHash, "same inputs -> same hash");
    assert.match(m1.candidateHash, /^[0-9a-f]{64}$/);
    const paths = m1.files.map((f) => f.path).sort();
    assert.deepEqual(paths, ["schema.graphql", "src/mapping.ts", "subgraph.yaml"]);
    // README (docs), .env (secret), node_modules excluded
    assert.ok(!paths.includes("README.md"));
    assert.ok(!paths.some((p) => p.includes(".env")));
    assert.ok(!paths.some((p) => p.includes("node_modules")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("changing one execution-relevant byte changes the candidate hash", () => {
  const dir = fixture();
  try {
    const before = buildCandidateManifest(dir).candidateHash;
    writeFileSync(join(dir, "src", "mapping.ts"), "export function handleDeposit(): void { /* bug */ }\n");
    const after = buildCandidateManifest(dir).candidateHash;
    assert.notEqual(before, after, "mapping change must change the candidate hash");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("changing a non-execution file (README) does NOT change the candidate hash", () => {
  const dir = fixture();
  try {
    const before = buildCandidateManifest(dir).candidateHash;
    writeFileSync(join(dir, "README.md"), "different docs\n");
    const after = buildCandidateManifest(dir).candidateHash;
    assert.equal(before, after);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
