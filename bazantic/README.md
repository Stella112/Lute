# Lute × Bazantic

Publish Lute's audit API as a paid **Bazantic** agent gateway. Bazantic fronts the
upstream with **x402 / MPP** payments and exposes each OpenAPI operation as a callable
**MCP recipe** — so any agent can pay-per-audit without bespoke integration.

Files here:
- [`openapi.json`](openapi.json) — the audit API spec Bazantic turns into MCP recipes
  (`auditVault`, `listSupportedEvents`). Points at Lute's `src/server.ts` endpoints.
- [`bazantic.yaml`](bazantic.yaml) — the gateway manifest (preview schema v1).

## Prerequisites (yours)

1. **Deploy Lute's audit endpoint publicly over HTTPS.** Bazantic's upstream must be
   reachable (`upstream.url`). Run `src/server.ts` (or the compose `lute` service) behind
   a TLS reverse proxy / domain, and host `openapi.json` at a public URL. Bazantic adds
   the paywall, so the upstream is the **plain** endpoint (not the x402 one).
2. A Bazantic account (for `baz login` — browser approval; I can't create accounts).

## Register (run these on your machine)

```bash
npm i -g @bazantic/cli
baz login                 # opens an approval URL in your browser
baz whoami

# register Lute as a gateway from its OpenAPI spec
baz gateway add \
  --spec-url https://uselute.xyz/openapi.json \
  --endpoint https://uselute.xyz \
  --name "Lute — Subgraph Reconciler" \
  --auth-type none \
  --status draft \
  --json

baz gateway list --json   # note the endpointUrl
```

The deployed Lute URL is `https://uselute.xyz`. Values mirror
[`bazantic.yaml`](bazantic.yaml) (the manifest path is preview and not yet accepted by the
released CLI, per Bazantic's docs — use `baz gateway add` for now).

## Consume it

```bash
# free discovery — no charge
curl -s https://<your-gateway>/mcp -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# paid call
baz grant create --name agent-1 --cap 5
baz curl 'https://<your-gateway>/api/audit?contract=0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183&event=Deposit&fromBlock=51115000&toBlock=51125000&subgraph=morpho' \
  -X POST \
  --account agent-1 --max-amount 0.02 --yes --json
```

`baz curl` returns `{ ok, status, paid, body }`, where `body` is the Lute `AuditReport`.
The gateway-facing operation uses query parameters so the paid retry does not depend
on a proxy preserving a JSON request body. Lute's direct REST endpoints still accept
the JSON body shown in the judge quickstart.

## What I built vs. what needs you

- Built here: the OpenAPI spec + gateway manifest + these commands — validated as
  well-formed and matching Lute's real endpoints.
- Yours: a public HTTPS deployment of the upstream, and `baz login` + `baz gateway add`
  under your account. Once the gateway is live, paste `baz gateway list --json` and I'll
  verify the recipes resolve and a `tools/list` returns the audit operation.
