# Bazantic support report — Lute gateway body forwarding

This report contains public URLs and reproduction details only. No private keys,
session tokens, RPC credentials, or payment signatures are included.

## Summary

The active Bazantic gateway exposes Lute's MCP tools successfully. A read-only
MCP `tools/list` request and the `info` tool call both return `200`.

The same JSON audit payload succeeds directly against Lute and through the Baz
CLI when Bazantic is not involved. When the request is sent through the paid
Bazantic gateway, the payment challenge is returned, but the post-payment
forwarded request reaches Lute as invalid JSON and returns HTTP `400`.

## Gateway

- Gateway slug: `374274w6xnchrppsi33r2y2xfy`
- Gateway URL: `https://374274w6xnchrppsi33r2y2xfy.bazgateway.com`
- MCP URL: `https://374274w6xnchrppsi33r2y2xfy.bazgateway.com/mcp`
- Upstream: `https://uselute.xyz`
- OpenAPI spec: `https://uselute.xyz/openapi.json`
- Gateway status: `active`

## Successful controls

1. Bazantic MCP `tools/list` with `Mcp-Protocol-Version: 2025-11-25` returns
   `200` and the generated Lute tools.
2. Bazantic MCP `tools/call` for the read-only `info` tool returns `200`.
3. The identical `POST /api/audit` payload sent directly to
   `https://uselute.xyz/api/audit` returns `200` and `VERIFIED`.
4. The identical payload sent through Baz CLI directly to Lute returns `200`
   and `VERIFIED`.

## Paid reproduction

The request was sent with:

```text
POST https://374274w6xnchrppsi33r2y2xfy.bazgateway.com/api/audit
content-type: application/json
```

Body:

```json
{
  "contract": "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183",
  "event": "Deposit",
  "fromBlock": 51115000,
  "toBlock": 51125000,
  "subgraph": "morpho"
}
```

Using Baz CLI with the approved capped test grant:

```text
baz curl <gateway>/api/audit -X POST \
  -H 'content-type: application/json' \
  --account lute-smoke --max-amount 0.01 --yes --json \
  -d '<body above>'
```

Result:

```json
{
  "ok": false,
  "status": 400,
  "body": { "error": "request body must be valid JSON" },
  "paid": {
    "amountUsd": "0.01",
    "receipt": null,
    "transaction": null
  }
}
```

The first attempt without `-X POST` was a local CLI error because a GET request
cannot carry a body. Adding `-X POST` and the JSON content type reproduced the
same Bazantic 400, so the issue remains in the paid forwarding path.

## Requested investigation

Please inspect the Bazantic gateway's post-payment request forwarding for JSON
request bodies. The gateway should preserve the original HTTP method, raw JSON
body, and `content-type: application/json` header when retrying the request after
the payment is accepted.

No settlement receipt or transaction was returned. Further payment retries were
stopped.
