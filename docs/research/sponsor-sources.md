# Sponsor Source Ingestion (Phase 0)

> Findings from current official sources, fetched during the hackathon. Client-specific
> install commands must be re-verified against each repo's live README on the day.

## The Graph — Subgraph MCP
- Open-source implementation of Anthropic's MCP for The Graph Network.
- Capabilities: access GraphQL **schemas** for any subgraph; **run GraphQL queries** on any deployment; **discover** top deployments by keyword or **contract address**; 30-day query volumes.
- Clients: Claude, Cline, Cursor. Config specifics live in `graphprotocol/mcp-monorepo` (fetch on the day).
- **Role for Lute:** DISCOVER / SCHEMA / QUERY (External Audit target resolution). Complementary to Lute MCP (BUILD/VERIFY/GATE/DEPLOY/MONITOR). Do not rebuild what it provides.

## The Graph — Subgraph Skills (`graphprotocol/subgraphs-skills`)
- Skills: `subgraph-dev`, `subgraph-optimization`, `subgraph-testing`. Structure: `SKILL.md` + `references/`.
- Install (Claude Code, per current README — verify): `claude plugins add PaulieB14/subgraphs-skills`.
- **Role:** used in the Lute BUILD workflow (scaffold schema/manifest/mappings, optimize, test with Matchstick/linter) instead of writing mappings from memory.

## Substreams Skills (`streamingfast/substreams-skills`)
- 9 skills incl. `substreams-dev`, **`substreams-ethereum`** (EVM ABI codegen/event decoding), `substreams-testing`, `substreams-sink*`, `substreams-hosted-sink`, `thegraph-market-api`.
- Install (Claude Code): `claude plugin marketplace add streamingfast/substreams-skills` then `claude plugin install substreams-dev@streamingfast-substreams`.
- **Role:** build the reusable ERC-4626 Substreams module (Phase 14) — search the registry / foundational modules first, reuse/compose before writing Rust.

## Hedera — x402 & Blocky402
- `hedera-dev/x402-hedera`: Hedera **testnet** paywall reference; USDC `0.0.429274` or native HBAR; Express 402 server + axios client; `@hashgraph/sdk`. **Uses its own facilitator, NOT Blocky402.**
- **Blocky402** (blocky402.com): the facilitator the ETHOnline Hedera prize **requires**. Open facilitator, **no API key on testnet**; hosted testnet supports **Hedera Testnet** (+ Polygon Amoy, Solana Devnet); hosted mainnet supports Hedera Mainnet. Client integrates via **`@x402/fetch`** (handles 402 → sign → retry-with-`X-PAYMENT` → decode settlement). Resource server returns 402 + requirements; settlement on-chain; decode via `getPaymentSettleResponse`.
- **Action for Lute (Phase 20):** implement the paid verification endpoint's settlement through Blocky402 on Hedera testnet; consumer demo agent uses `@x402/fetch`. Confirm the exact Blocky402 facilitator base URL from its docs on the day.
- HCS attestation (Hedera Consensus Service) already implemented in prior work (`src/hedera.ts`, live on testnet topic `0.0.10485368`) — reuse as the optional attestation strengthener.

## Bazantic (bazantic.com/docs)
- AI-agent gateway: registers an API from an **OpenAPI/OpenRPC spec** (`baz gateway add --spec-url … --endpoint …`), fronts it with **x402/MPP** payments, exposes operations as MCP **recipes/ingredients**; `baz login` (browser), `baz grant`, `baz curl` for paid calls; free discovery via `POST {endpoint}/mcp` `tools/list`.
- **Role:** Gateway over `openapi/lute.yaml`; "Verify Before Trust" Recipe. Prior Bazantic artifacts (`bazantic/openapi.json`, `bazantic.yaml`) are a starting point — align to `openapi/lute.yaml` and current Bazantic requirements.

## Discrepancies logged (per contract §"if docs contradict")
1. **Hedera facilitator**: prize requires **Blocky402**; the `x402-hedera` sample ships a different facilitator. → Use Blocky402 for the qualifying demo.
2. **subgraphs-skills owner**: contract lists `graphprotocol/subgraphs-skills`; the live install path resolved to `PaulieB14/subgraphs-skills`. → Verify the canonical repo/owner on the day before relying on it.
