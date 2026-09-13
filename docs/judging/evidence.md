# ETHOnline judge evidence

This file is intentionally a record of real evidence, not a list of planned claims.
Replace each `NOT RECORDED` entry only after reproducing the corresponding live flow.

## The Graph

- Public repository: `https://github.com/Stella112/Lute`
- Public demo/API origin: `https://uselute.xyz`
- Base RPC network/range: recorded in each generated `AuditReport`
- Real Graph deployment/query target: self-hosted Graph Node on the Qevor VPS,
  deployments `lute/steak-honest` and `lute/steak-bugged`; Lute image deployed from
  commit `6d28a42`.
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
- Substreams package/deployment: `NOT RECORDED`
- Fault benchmark results: offline controlled fixtures exist; qualifying live links:
  `NOT RECORDED`

## Hedera

- Blocky402 facilitator: `https://api.testnet.blocky402.com`
- Paid endpoint: `NOT RECORDED AS A PUBLIC HTTPS SERVICE`
- Hedera payment transaction: `NOT RECORDED — requires an approved funded testnet request`
- HCS topic/message: see the output of `lute attest`; current local topic is not a
  substitute for a payment-flow record.

## Bazantic

- Active Lute audit gateway URL: `https://sewytfjysrf5xb4qjhdoyc5uei.bazgateway.com`
- Active Lute audit MCP endpoint: `https://sewytfjysrf5xb4qjhdoyc5uei.bazgateway.com/mcp`
- Gateway status: `active`; public MCP `tools/list` and read-only `info` call verified
- Gateway operations: generated from `https://uselute.xyz/openapi.json`; the current
  audit tools expose query-shaped top-level MCP arguments (`contract`, `fromBlock`,
  `toBlock`, with optional `event` and `subgraph`).
- Paid gateway smoke test: `NOT RECORDED AS PASSING` — a paid request has not been
  re-run after the replacement gateway was created, so no paid success is claimed.
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
- Bazantic account username: `NOT RECORDED`
- Other sponsor service used by the Recipe: The Graph Subgraph Studio

## Media and submission

- Demo video URL: `NOT RECORDED`
- Submission URL: `NOT RECORDED`
- Last evidence review date: `NOT RECORDED`

Do not replace these entries with invented URLs, transaction IDs, counts, or screenshots.
