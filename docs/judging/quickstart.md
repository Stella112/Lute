# Lute judge quickstart

Lute is hosted at `https://uselute.xyz`. Judges do not need the owner's computer,
SSH access, private keys, or local Bazantic CLI.

## 1. Try the web application

Open the live dashboard:

`https://uselute.xyz/app`

Run the example Base ERC-4626 audit and inspect the verdict, event counts, checks,
first-divergence evidence, and provenance.

## 2. Call the public REST API

The public OpenAPI document is:

`https://uselute.xyz/openapi.json`

Example request:

```bash
curl -X POST https://uselute.xyz/v1/audits \
  -H 'content-type: application/json' \
  -d '{
    "contract": "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183",
    "event": "Deposit",
    "fromBlock": 51115000,
    "toBlock": 51125000,
    "subgraph": "morpho"
  }'
```

The honest example should return `VERIFIED` with matching raw-chain and indexed
event counts. The response includes the checks, source provenance, and evidence
root; it does not require an API key.

Useful read-only endpoints:

- `GET https://uselute.xyz/api/events`
- `GET https://uselute.xyz/v1/integrity-packs`
- `GET https://uselute.xyz/v1/integrity-packs/erc4626@1`
- `GET https://uselute.xyz/v1/verifications/{runId}`
- `GET https://uselute.xyz/v1/verifications/{runId}/evidence`
- `GET https://uselute.xyz/v1/verifications/{runId}/pack` — portable pack, TrustManifest,
  candidate binding, evidence lineage, and public payment receipt metadata

From a fresh clone, the no-secrets smoke test checks the public service and pack
metadata. Add `--audit` to run the live free example as well:

```bash
npm run judge:smoke -- --base-url https://uselute.xyz
npm run judge:smoke -- --base-url https://uselute.xyz --audit
```

## 3. Connect through Bazantic MCP

The active Bazantic gateways are:

`https://sewytfjysrf5xb4qjhdoyc5uei.bazgateway.com/mcp`

This is the Lute audit gateway. It exposes Lute operations as MCP tools, including `auditVault`,
`auditVaultV1`, `verifyCurrentCandidate`, `getVerification`,
`getVerificationEvidence`, `getVerifiedManifest`, `listSupportedEvents`,
`listIntegrityPacks`, and `getErc4626Pack`.

The audit tools accept `contract`, `fromBlock`, and `toBlock` as top-level MCP
arguments, with optional `event` and `subgraph` arguments. This shape lets the
Bazantic gateway forward the paid request without depending on a JSON request body.

The Graph provider adapter is available at:

`https://ssr3i3ifazfv3llppiubwpuxqe.bazgateway.com/mcp`

It exposes `queryGraphEvents`, which reads the deployed Graph Studio candidate through
the public Lute adapter. The published Verify Before Trust Recipe is
`verify-before-trust-graph-lute`; it calls that Graph tool first and then calls Lute's
audit tool with `subgraph=graphstudio`.

MCP tool discovery is free. Audit execution through the gateway is pay-per-request,
so a judge who wants to run a paid gateway call must use their own Bazantic account,
wallet, or approved test credit. The owner's payment grant is device-specific and
must not be shared.

MCP-capable clients should use the gateway URL directly. The client handles the
MCP protocol handshake; raw protocol checks require the `Mcp-Protocol-Version`
header and Streamable HTTP `Accept` header.

## What stays online

- Lute's API and dashboard run on the Qevor VPS.
- The Bazantic gateway and remote MCP endpoint run on Bazantic.
- The owner's Windows CLI is only for account management and optional payment tests.

Turning off the owner's computer does not stop the public application or gateway.

## Security boundary

No judge should receive a private key, RPC credential, Bazantic session token, or
Hedera operator key. Public testing uses the URLs above; payment credentials belong
to the caller.
