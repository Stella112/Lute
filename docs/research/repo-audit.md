# Repository Audit vs. Master Build Contract (Phase 0)

> Inspected the repo, code, and git history before changing anything. This maps what
> already exists (from prior build work) to the contract's completion checklist (§84),
> so we build only what's missing.

## Current layout (actual)
Single-package TypeScript backend at repo root (`src/`) + a Vite/React frontend in `web/`
+ a real subgraph in `subgraph/` + deploy stack in `deploy/` + `bazantic/` artifacts +
`docs/`. **Not** the recommended `apps/*` + `packages/*` monorepo (§10). Refactor to the
monorepo shape is optional and should not block core work; noted as a discrepancy.

## Checklist mapping

| Contract item (§84) | Status | Where |
|---|---|---|
| ETHOnline sponsor requirements researched from current sources | ✅ done (Phase 0) | `docs/research/*` |
| Real Base ERC-4626 target validated | ✅ | `docs/research/erc4626-target.md` |
| Raw RPC reader works (chunk/retry/fail-closed) | ✅ | `src/rpc.ts`, `src/canonical.ts` |
| Graph adapter uses live Graph data | ✅ (graph-node subgraph + Morpho) | `src/subgraph/graphNode.ts`, `morpho.ts` |
| Canonical event model | ✅ | `src/types.ts`, `src/canonical.ts`, `src/abi.ts` |
| ERC-4626 Integrity Pack | ✅ reviewed `pack.yaml` + schema + runtime SDK/artifact endpoint | `integrity-packs/erc4626`, `src/integrity-pack.ts` |
| Reconciliation + first divergence | ✅ (bisection engine) | `src/reconcile.ts`, `src/divergence.ts` |
| Evidence Graph (block→…→verdict lineage IDs) | ✅ portable pack emits stable run/source/check/divergence/verdict lineage IDs | `src/integrity-pack.ts` |
| Fail-closed check statuses | ✅ | `src/audit.ts` (decideVerdict), negative tests |
| Explicit coverage | 🟡 partial — checks list yes; strong/conditional counts not formalized | `src/reconcile.ts` |
| Correct real candidate verifies (75==75 VERIFIED) | ✅ | live + `evidence_*.json` |
| Multiple fault injections fail; same verifier | 🟡 partial — one planted bug (block-id) + swap/duplicate variants; not a full corpus | `src/subgraph/localMapping.ts`, subgraph `mapping.bugged.ts` |
| Candidate hashing + stale invalidation | ✅ deterministic manifest/hash + tests | `src/candidate.ts`, `test/candidate.test.ts` |
| Deployment gate blocks bad/stale | ✅ pure backend decision + CLI gate; no persistent deployment service yet | `src/gate.ts`, `src/cli.ts`, `test/gate.test.ts` |
| Build workflow (NL → scaffold → deploy) | 🟡 supported Base ERC-4626 intent now scaffolds, validates, optionally codegens/builds, and hashes; verification/gate/deploy remain explicit | `src/build.ts`, `src/cli.ts` |
| Repair workflow + reverification | 🟡 deterministic RepairContext + opt-in known identity fix; fresh verification/gate remain explicit | `src/repair.ts`, `src/cli.ts` |
| Deploy exact verified candidate to Studio + smoke query | ✅ generated candidate `v0.1.1` deployed to Graph Studio on Base; post-deploy differential verification and entity smoke query passed | `src/build.ts`, `deploy/`, `subgraph/` |
| External Audit for a supported deployment | ✅ (real, via UI + backend) | `web/.../ExternalAudit.tsx`, `/api/audit` |
| Trust Manifest | ✅ formal TrustManifest is included in each portable pack artifact | `src/integrity-pack.ts`, `/v1/verifications/{runId}/pack` |
| Lute MCP | ✅ (audit/explain/supported_events) — smaller tool set than §37 | `src/mcp.ts` |
| OpenAPI spec | 🟡 `bazantic/openapi.json` exists; not the full `openapi/lute.yaml` (§39) | `bazantic/openapi.json` |
| Reusable Substreams path (live) | ✅ live differential verified: Deposit 75/75 and Withdraw 109/109 | `src/subgraph/substreams.ts`, `test/substreams.test.ts` |
| Monitoring (runtime vs integrity) + incidents | 🟡 UI only (demo) | `web/` |
| Hedera paid audit via **Blocky402** + real paid request | ✅ live x402 v2 request settled on Hedera testnet; receipt and VERIFIED audit recorded | `src/paid/`, `docs/judging/evidence.md` |
| HCS attestation | ✅ live testnet (topic `0.0.10485368`) | `src/hedera.ts` |
| Bazantic Gateway + Verify-Before-Trust Recipe | ✅ live Lute + Graph gateways, published Recipe, and paid 0.01 USDC Base smoke test returning VERIFIED 75/75 | `bazantic/`, `docs/judging/evidence.md` |
| Light/dark evidence-first UI | ✅ landing + dashboard | `web/` |
| No fake live data / no secrets committed | ✅ (`.env` gitignored; demo namespaced) | — |
| Tests pass | ✅ 39 backend offline + live; frontend builds | `test/` |
| README reproducible / demo script / judge evidence | ✅ README, demo script, and honest evidence ledger | `README.md`, `docs/demo/`, `docs/judging/` |

## Biggest gaps to close for the contract (priority)
1. **Broaden Build + Repair beyond the first ERC-4626 workflow and wire current Graph skills** — §10/11/27/29.
2. Add richer persisted monitoring incidents and automated re-verification history.
3. `openapi/lute.yaml` alignment and the remaining architecture docs.

## Invariant check on existing verifier
- INVARIANT A (candidate vs verifier independence): ✅ verifier decodes raw logs; never runs candidate mapping.
- INVARIANT E/I (fail-closed, no false VERIFIED): ✅ INCONCLUSIVE on source failure; tested.
- Invariant F/G: ✅ the hash and pure gate prevent a hash mismatch from being allowed; a persistent deploy service and automated H reverification are still missing.
