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
| ERC-4626 Integrity Pack | 🟡 partial — checks exist, not yet a `pack.yaml` standard/SDK | `src/reconcile.ts`, `src/abi.ts` |
| Reconciliation + first divergence | ✅ (bisection engine) | `src/reconcile.ts`, `src/divergence.ts` |
| Evidence Graph (block→…→verdict lineage IDs) | 🟡 partial — firstDivergence carries evidence, no formal lineage IDs | `src/divergence.ts` |
| Fail-closed check statuses | ✅ | `src/audit.ts` (decideVerdict), negative tests |
| Explicit coverage | 🟡 partial — checks list yes; strong/conditional counts not formalized | `src/reconcile.ts` |
| Correct real candidate verifies (75==75 VERIFIED) | ✅ | live + `evidence_*.json` |
| Multiple fault injections fail; same verifier | 🟡 partial — one planted bug (block-id) + swap/duplicate variants; not a full corpus | `src/subgraph/localMapping.ts`, subgraph `mapping.bugged.ts` |
| Candidate hashing + stale invalidation | ❌ not built | — |
| Deployment gate blocks bad/stale | 🟡 UI only (demo) — no deterministic backend `DeploymentGateDecision` | `web/.../Overview.tsx` |
| Build workflow (NL → scaffold → deploy) | ❌ not built (Graph skills not wired into a build pipeline) | — |
| Repair workflow + reverification | 🟡 conceptual — bugged/honest mappings exist; no RepairContext pipeline | — |
| Deploy exact verified candidate to Studio + smoke query | 🟡 self-hosted graph-node deploy done; **Subgraph Studio** deploy not done | `deploy/`, `subgraph/` |
| External Audit for a supported deployment | ✅ (real, via UI + backend) | `web/.../ExternalAudit.tsx`, `/api/audit` |
| Trust Manifest | 🟡 UI + attestation payload; no formal `TrustManifest` schema/route | `src/hedera.ts`, UI |
| Lute MCP | ✅ (audit/explain/supported_events) — smaller tool set than §37 | `src/mcp.ts` |
| OpenAPI spec | 🟡 `bazantic/openapi.json` exists; not the full `openapi/lute.yaml` (§39) | `bazantic/openapi.json` |
| Reusable Substreams path (live) | ❌ not built | — |
| Monitoring (runtime vs integrity) + incidents | 🟡 UI only (demo) | `web/` |
| Hedera paid audit via **Blocky402** + real paid request | ❌ not built (prior x402 used generic facilitator; HCS attestation ✅) | `src/x402-server.ts`, `src/hedera.ts` |
| HCS attestation | ✅ live testnet (topic `0.0.10485368`) | `src/hedera.ts` |
| Bazantic Gateway + Verify-Before-Trust Recipe | 🟡 artifacts only; no live Gateway/Recipe | `bazantic/` |
| Light/dark evidence-first UI | ✅ landing + dashboard | `web/` |
| No fake live data / no secrets committed | ✅ (`.env` gitignored; demo namespaced) | — |
| Tests pass | ✅ 39 backend offline + live; frontend builds | `test/` |
| README reproducible / demo script / judge evidence | 🟡 README yes; `docs/demo`, `docs/judging` not written | `README.md` |

## Biggest gaps to close for the contract (priority)
1. **Candidate hashing + Deployment Gate (backend, deterministic)** — §25/26; enables the core acceptance test.
2. **Hedera paid verification via Blocky402** — §45/46 (the Hedera $6k requirement).
3. **Reusable ERC-4626 Substreams module + differential path** — §14/34/35 (the Graph composable $5k).
4. **Integrity Pack SDK + `pack.yaml` standard** — §17/18.
5. **Build + Repair workflow wired to Graph skills** — §10/11/27/29.
6. **Studio deployment + smoke test** — §12/31/32.
7. **Bazantic live Gateway + Recipe** — §22/53/54.
8. `openapi/lute.yaml`, docs/architecture, docs/demo, docs/judging.

## Invariant check on existing verifier
- INVARIANT A (candidate vs verifier independence): ✅ verifier decodes raw logs; never runs candidate mapping.
- INVARIANT E/I (fail-closed, no false VERIFIED): ✅ INCONCLUSIVE on source failure; tested.
- Others (F/G candidate-hash binding, H reverification): ❌ not yet enforced (no candidate hash) — top priority.
