#!/usr/bin/env bash
# Build and deploy both subgraphs (honest + bugged) to the local Graph Node.
# Run from the repo root on the VPS AFTER `docker compose ... up -d`:
#   bash deploy/deploy-subgraphs.sh
# Requires Node.js on the host (for graph-cli). Talks to graph-node's mapped ports.
set -euo pipefail

GRAPH_NODE_ADMIN="${GRAPH_NODE_ADMIN:-http://localhost:8020}"
IPFS="${IPFS:-http://localhost:5001}"

cd "$(dirname "$0")/../subgraph"
npm install

deploy_one() {
  local name="$1" manifest="$2"
  echo "=== $name ($manifest) ==="
  npx graph codegen "$manifest"
  npx graph build "$manifest"
  npx graph create --node "$GRAPH_NODE_ADMIN" "$name" 2>/dev/null || true
  npx graph deploy --node "$GRAPH_NODE_ADMIN" --ipfs "$IPFS" --version-label v0.0.1 "$name" "$manifest"
}

deploy_one "lute/steak-honest" "subgraph.honest.yaml"
deploy_one "lute/steak-bugged" "subgraph.bugged.yaml"

echo
echo "Deployed. Watch sync with:"
echo "  curl -s http://localhost:8000/subgraphs/name/lute/steak-honest -X POST -H 'content-type: application/json' \\"
echo "    -d '{\"query\":\"{ _meta { block { number } } hasIndexingErrors }\"}'"
