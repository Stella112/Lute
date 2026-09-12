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

- Gateway URL: `NOT RECORDED`
- Verify Before Trust Recipe: `NOT RECORDED`
- Bazantic account username: `NOT RECORDED`
- Other sponsor service used by the Recipe: `NOT RECORDED`

## Media and submission

- Demo video URL: `NOT RECORDED`
- Submission URL: `NOT RECORDED`
- Last evidence review date: `NOT RECORDED`

Do not replace these entries with invented URLs, transaction IDs, counts, or screenshots.
