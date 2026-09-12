// Candidate hashing (contract §25).
//
// A candidate is the set of execution-relevant files for a Graph indexer (subgraph.yaml,
// schema.graphql, mappings, ABIs, network config, optional Substreams). We build a
// deterministic manifest (sorted path + content hash) and hash that into a single
// CandidateHash. The verification is bound to this hash; the deployment gate later
// refuses to deploy anything whose hash differs from the verified one (Invariants F/G).

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep, basename } from "node:path";

export type CandidateFile = { path: string; sha256: string; bytes: number };
export type CandidateManifest = {
  root: string;
  files: CandidateFile[];
  fileCount: number;
  candidateHash: string;
};

// Execution-relevant file types. UI, docs, tests, node_modules, build output excluded.
const DEFAULT_INCLUDE = [/\.ya?ml$/, /\.graphql$/, /\.ts$/, /\.json$/, /\.wasm$/, /\.rs$/, /\.toml$/, /\.abi$/];
const DEFAULT_EXCLUDE_DIRS = ["node_modules", "build", "generated", ".git", "dist", "coverage"];
const EXCLUDE_NAMES = new Set([".env", ".env.local"]);

function sha256Hex(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

function walk(dir: string, excludeDirs: string[], acc: string[]): void {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (excludeDirs.includes(name)) continue;
      walk(full, excludeDirs, acc);
    } else {
      acc.push(full);
    }
  }
}

export function buildCandidateManifest(
  root: string,
  opts: { include?: RegExp[]; excludeDirs?: string[] } = {},
): CandidateManifest {
  const include = opts.include ?? DEFAULT_INCLUDE;
  const excludeDirs = opts.excludeDirs ?? DEFAULT_EXCLUDE_DIRS;

  const found: string[] = [];
  walk(root, excludeDirs, found);

  const files: CandidateFile[] = [];
  for (const full of found) {
    const rel = relative(root, full).split(sep).join("/");
    if (EXCLUDE_NAMES.has(basename(rel))) continue;
    if (!include.some((re) => re.test(rel))) continue;
    const content = readFileSync(full);
    files.push({ path: rel, sha256: sha256Hex(content), bytes: content.length });
  }
  // deterministic order by path
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // candidate hash = sha256 over the manifest lines "path\0contentHash\n"
  const h = createHash("sha256");
  for (const f of files) h.update(`${f.path}\0${f.sha256}\n`);

  return { root, files, fileCount: files.length, candidateHash: h.digest("hex") };
}

/** Short display form of a candidate hash. */
export function shortHash(hash: string, n = 16): string {
  return hash.slice(0, n);
}
