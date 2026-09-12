# ETHOnline 2026 — Prize Requirements & Lute Qualification Map

> Phase 0 research. Sourced from the live ETHGlobal ETHOnline 2026 prizes page and
> sponsor docs (fetched during the hackathon). Re-verify on submission day.

## The Graph

### Best AI Tooling or AI Use Case — From Scratch ($5,000)
Requirements (verbatim, condensed):
- Use The Graph as a **load-bearing** part of the project.
- **Consume live data from a Graph provider** (Subgraph Studio or Market).
- Do **meaningful work** with the data (reasoning, decisions, automation) — not a chatbot.
- Open-source with a clear README + demo video. Select the **"Start Fresh"** pool.

How Lute satisfies it:
- The Graph is load-bearing: Lute audits/verifies Graph subgraphs; without The Graph the product changes fundamentally.
- Live Graph data: `GraphNodeSource` queries a real deployed subgraph (Studio + self-hosted graph-node); Morpho public index as a second source.
- Meaningful work: independent verification, first-divergence, deployment gate, repair — automated decisions, not chat.
- Reusable: ERC-4626 Integrity Pack work is present; the reusable Substreams module remains planned and is not claimed as complete.

### Best Use of Composable or Standardized Graph Products ($5,000)
Requirements:
- **Compose 2+ Graph products** OR **build meaningfully on a standardized schema**.
- Consume live Graph provider data. Make the standardization leverage clear.
- Simply querying one subgraph does **not** qualify. Repo + demo.

How Lute satisfies it:
- Intended composition: Subgraph/Graph provider data + Substreams + Subgraph MCP for discovery. The Substreams and live MCP evidence are still pending and must be demonstrated before claiming this prize.
- Standardization: the ERC-4626 **Integrity Pack** (`erc4626@1`) is a reusable standard; a reusable ERC-4626 Substreams package makes the standard portable.

## Hedera — AI & Agentic Payments ($6,000)
Requirements:
- Host a **live x402-gated service on Hedera testnet/mainnet, settled through the Blocky402 facilitator**.
- A platform/agent **consumes** it and completes **≥1 real paid request**.
- Repo + README (payment flow) + demo.

How Lute satisfies it:
- Paid verification endpoint (`POST /v1/paid/audits`) → 402 → Blocky402 settlement on Hedera testnet → real verification compute runs → scoped verdict + evidence.
- A demo agent pays and consumes it; optional HCS attestation of the evidence root.
- **Gap vs prior work:** prior x402 used a generic facilitator on base-sepolia. This prize **requires Blocky402 on Hedera** — must re-implement the settlement path. (Prior Hedera HCS attestation is reusable for the optional strengthener.)

## Bazantic

### Best Recipe that uses Sponsor APIs ($1,000) — PRIMARY target
Requirements:
- Create an **x402/MPP Gateway in Bazantic**.
- Use **≥1 other service** available through Bazantic OR a sponsor.
- A **Recipe** using both in one working flow. Screen recording. Bazantic username in submission.

How Lute satisfies it:
- Bazantic artifacts currently describe the audit API in `bazantic/openapi.json`; the live Gateway and Verify-Before-Trust Recipe are still pending and the spec should be aligned before submission.
- **"Verify Before Trust" Recipe**: a Graph sponsor service resolves/queries a data source → Lute audits it → policy gate. Outcome depends on both The Graph and Lute.

### Agentify a New API ($1,000) — possible secondary
- Add a service not previously on Bazantic/sponsors; working Gateway; recipe; screen recording. (Lute itself is the new API.)

> Do NOT target the Continuity-only category (net-new project).

## Cross-cutting deliverables
Public repo (started during event) · meaningful phased commits · reproducible README ·
demo video · no committed secrets · live/real integrations (mocks only for tests).
