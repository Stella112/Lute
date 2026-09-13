# ETHOnline judge evidence

This file is intentionally a record of real evidence, not a list of planned claims.
Replace each `NOT RECORDED` entry only after reproducing the corresponding live flow.

## The Graph

- Public repository: `https://github.com/Stella112/Lute`
- Public demo/API origin: `https://uselute.xyz`
- Base RPC network/range: recorded in each generated `AuditReport`
- Real Graph deployment/query target: self-hosted Graph Node on the Qevor VPS,
  deployments `lute/steak-honest` and `lute/steak-bugged`; Lute image deployed from
  commit `c0f5dd7`.
- Exact generated candidate deployment: Graph Studio project `lute`, Base version
  `v0.1.1`, query endpoint
  `https://api.studio.thegraph.com/query/1760216/lute/v0.1.1`; Qevor Build workflow
  ran from commit `f3f5185`, with Graph codegen/build passing and candidate hash
  `99e7c976b018650adeb55792b034317c564fdfcdb521cdd6874f305c5bb63059`.
- Post-deploy verification: Base blocks `51115000–51125000`, RAW_RPC `75`, indexed
  `75`, all 9 strong checks passed, verdict `VERIFIED`; VerificationRun
  `7e7a35b4-b079-4002-bcc9-a1eb03450eb3`, evidence root
  `34d5e7ecc33c8e61c7eae7bbc00c7ced6b79cd8dfe2f07abfe33c34e51a69038`, gate `ALLOWED`.
- Reproduced honest run: Base blocks `51115000–51121000`, RAW_RPC `49`, indexed `49`,
  verdict `VERIFIED`; evidence root `4540bee57e1825ab9c44f3afd11cd836ed86d02b996bd6fe376c63082c51c9ef`.
- Reproduced bugged run: RAW_RPC `49`, indexed `48`, verdict `FAILED`; first divergence
  block `51120808`, transaction
  `0x443364da3be710fc49773b87fdb5ed88805f2fe09c4fbe1dd7cd130217d82260`, log index `496`.
- Public judge smoke test: `PASSING` on 2026-09-13. Health, OpenAPI, the live
  `erc4626@1` pack manifest, supported events, and a free live 75-event audit all
  returned HTTP 200; the audit verdict was `VERIFIED` with evidence root
  `5c57b687a4f3caa72b06cb301970087492f82dffe5a55318f506d99f87ddd02c`.
- Portable Integrity Pack endpoint: `GET /v1/verifications/{runId}/pack` returns the
  reviewed pack, TrustManifest, candidate binding, report, and stable evidence lineage.
- Substreams package/deployment: `NOT RECORDED`
- Fault benchmark results: offline controlled fixtures exist; qualifying live links:
  `NOT RECORDED`

## Hedera

- Blocky402 facilitator: `https://api.testnet.blocky402.com`
- Paid endpoint: `https://uselute.xyz/v1/paid/audits`
- Live paid request: Blocky402 `/verify` accepted the buyer-signed Hedera transfer,
  Lute completed the real 75-event audit, and Blocky402 `/settle` returned HTTP 200.
  The settlement transferred `1 HBAR` (`100000000` tinybars) from payer
  `0.0.10484280` to Lute `0.0.10483052` on Hedera testnet. Mirror Node recorded
  `SUCCESS` with transaction ID `0.0.7162784-1789290230-015764738` and charged fee
  `265223` tinybars. [View on HashScan](https://hashscan.io/#/testnet/transaction/0.0.7162784-1789290230-015764738).
- Paid audit result: `VERIFIED`, raw `75`, indexed `75`, `7/9` checks passing; the
  Morpho source does not expose `sender`/`owner`, so those two fields are honestly
  `UNVERIFIED`. Run ID `eade836f-4ac8-418a-a5c1-839c4f9b9196`; evidence root
  `995194377384157c3a0670bf19688375621542386c58aab6fa44ea6e66f9bb17`.
- HCS topic/message: see the output of `lute attest`; current local topic is not a
  substitute for a payment-flow record.

## Bazantic

- Active Lute audit gateway URL: `https://sewytfjysrf5xb4qjhdoyc5uei.bazgateway.com`
- Active Lute audit MCP endpoint: `https://sewytfjysrf5xb4qjhdoyc5uei.bazgateway.com/mcp`
- Gateway status: `active`; public MCP `tools/list` and read-only `info` call verified
- Gateway operations: generated from `https://uselute.xyz/openapi.json`; the current
  audit tools expose query-shaped top-level MCP arguments (`contract`, `fromBlock`,
  `toBlock`, with optional `event` and `subgraph`).
- Paid gateway smoke test: `PASSING` on 2026-09-13 through Bazantic's native client.
  The replacement gateway charged `0.01 USDC` on Base and returned HTTP `200` with
  verdict `VERIFIED`, `75` raw events, `75` indexed events, and all 9 strong checks
  passing. Base transaction:
  `0x8dfd35054f8116ab57c8cb1a8524b04464d93c078491f59131418d85da216b1a`
  (`https://basescan.org/tx/0x8dfd35054f8116ab57c8cb1a8524b04464d93c078491f59131418d85da216b1a`).
  VerificationRun: `d20c65f1-6b9b-44cd-991d-31d736af4dd7`; evidence root:
  `33ec058b65bf67aa7ce84db81b36a5da154395839e095a058e5bd52c76d32b8de`.
- Historical provider issue: the previous active gateway
  `374274w6xnchrppsi33r2y2xfy` returned HTTP 400 (`request body must be valid JSON`)
  after its payment challenge. The replacement gateway was created with the corrected
  query-shaped MCP schema; see `docs/judging/bazantic-support-report.md` for the
  sanitized reproduction against the old gateway.
- Active Graph provider gateway URL: `https://ssr3i3ifazfv3llppiubwpuxqe.bazgateway.com`
- Active Graph provider MCP endpoint: `https://ssr3i3ifazfv3llppiubwpuxqe.bazgateway.com/mcp`
- Graph provider gateway status: `active`; public MCP `tools/list` verified
- Graph provider upstream: `https://api.studio.thegraph.com/query/1760216/lute/v0.1.1`
- Free two-service backend flow: Graph Studio returned `75` indexed events and the
  Lute audit of `subgraph=graphstudio` returned `VERIFIED` with `75` raw and indexed
  events; run `e1ef6faf-d08a-44f6-bc4e-75c7f8fb459f`.
- Verify Before Trust Recipe: `verify-before-trust-graph-lute` — `published`; it binds
  `queryGraphEvents` and `auditVault`.
- Bazantic account username: `mebostellamaris`
- Other sponsor service used by the Recipe: The Graph Subgraph Studio

## Media and submission

- Demo video URL: `NOT RECORDED`
- Submission URL: `NOT RECORDED`
- Last evidence review date: `2026-09-13`

Do not replace these entries with invented URLs, transaction IDs, counts, or screenshots.
