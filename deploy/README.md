# Lute on a VPS — real Graph Node + app

The public Lute origin is `https://uselute.xyz`. Keep the Lute dashboard and paid
service bound to localhost, and add the site block from
[`Caddyfile.uselute.example`](Caddyfile.uselute.example) in front of them. Do not
reuse a Qevor domain or replace unrelated Caddy sites on a shared VPS.

This stands up a **real Graph Node**, deploys the Lute subgraph (an honest build and a
build with a planted mapping bug), and runs the *unchanged* Lute verifier against both —
closing Phase 1's last caveat (the candidate index becomes a real Graph-protocol
subgraph, and the bug becomes a real AssemblyScript bug in deployed WASM).

The subgraph compiles locally in CI-style already (`graph build` produces WASM); what a
VPS adds is the runtime (graph-node + postgres + ipfs) to actually index and serve it.

## Requirements

- Linux VPS, ~2–4 GB RAM, root/sudo.
- Docker Engine + compose plugin.
- Node.js 18+ on the host (only to run `graph-cli` for deployment).
- A Base **archive** RPC. The public `https://mainnet.base.org` works but may rate-limit
  graph-node's polling; a dedicated archive RPC syncs more reliably.

## 1. Install Docker (Ubuntu/Debian)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker   # run docker without sudo
```

## 2. Clone and configure

```bash
git clone https://github.com/Stella112/Lute.git && cd Lute
cp deploy/.env.example deploy/.env
# edit deploy/.env: set BASE_RPC_VERIFIER (archive RPC) and a POSTGRES_PASSWORD
```

## 3. Bring up the stack

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.yml logs -f graph-node   # watch it start
```

Services: `graph-node` (GraphQL :8000, deploy :8020, status :8030), `ipfs` (:5001),
`postgres`, and `lute` (dashboard :8788).

The optional `lute-paid` service is in the `paid` profile. Start it only after
setting the Hedera/Blocky402 values in `deploy/.env`:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env --profile paid up -d --build lute-paid
```

## 4. Deploy both subgraphs

```bash
bash deploy/deploy-subgraphs.sh
```

This builds + deploys `lute/steak-honest` and `lute/steak-bugged` (both index the
Steakhouse USDC vault from block 51,115,000). Wait for each to sync past the audit
range (to block ≥ 51,125,000):

```bash
curl -s http://localhost:${GRAPH_QUERY_PORT:-8000}/subgraphs/name/lute/steak-honest -X POST \
  -H 'content-type: application/json' \
  -d '{"query":"{ _meta { block { number } } hasIndexingErrors }"}'
```

Indexing ~35k blocks of a single contract typically takes a few minutes.

## 5. Run Lute against the real Graph Node

From inside the `lute` container (its `GRAPH_NODE_URL` already points at `graph-node`):

```bash
DC="docker compose -f deploy/docker-compose.yml"

# HONEST -> expect VERIFIED, 75 == 75 (and sender/owner now VERIFIED too,
# since this subgraph exposes the address fields Morpho does not)
$DC exec lute node --import tsx src/cli.ts audit \
  --network base --contract 0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183 \
  --event Deposit --from-block 51115000 --to-block 51125000 \
  --subgraph graphnode:lute/steak-honest --explain

# BUGGED -> expect FAILED, 75 vs 74, first divergence @ block 51120808
$DC exec lute node --import tsx src/cli.ts audit \
  --network base --contract 0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183 \
  --event Deposit --from-block 51115000 --to-block 51125000 \
  --subgraph graphnode:lute/steak-bugged --explain
```

The **same unchanged verifier** should VERIFY the honest deployment and FAIL the bugged
one — the planted `event.block.number`-as-id bug (see
[`subgraph/src/mapping.bugged.ts`](../subgraph/src/mapping.bugged.ts)) collapses block
51,120,808's two deposits into one, and Lute's independent RPC reconstruction catches
the missing event and bisects to it. Nothing about the bug is known to the verifier.

## 6. (Optional) run the app services

- Dashboard is bound to **localhost only** (not public). View it via an SSH tunnel from
  your machine: `ssh -L 8788:localhost:8788 root@<vps>`, then open `http://localhost:8788`.
- Watch runner on a schedule (cron on the host):
  ```bash
  0 * * * * cd /path/to/Lute && docker compose -f deploy/docker-compose.yml exec -T lute \
    node --import tsx src/cli.ts watch --config lute.targets.example.json >> /var/log/lute-watch.log 2>&1
  ```
  (Point a target's `subgraph` at `graphnode:lute/steak-honest` to watch the real subgraph.)

- The production dashboard has a safe one-target watchlist in
  `lute.monitor.example.json`. Its **Monitoring → Run monitoring** action calls
  `POST /v1/monitoring/run`, persists the raw-vs-index verification result, and
  records an incident with first-divergence evidence when the target is not verified.
  A later verified recheck resolves the matching incident. Keep the existing
  `lute.targets.example.json` for the three-target CLI demo, including its intentional
  bugged mapping.

- To enable recurring checks on a host, install `deploy/lute-monitor.cron` as
  `/etc/cron.d/lute-monitor`. It runs the fixed production watchlist hourly, uses
  `flock` to prevent overlap, and writes no response body to a log.

## Teardown

```bash
docker compose -f deploy/docker-compose.yml down          # keep data
docker compose -f deploy/docker-compose.yml down -v       # also drop postgres/ipfs volumes
```
