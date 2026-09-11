// Shared SubgraphSource factory used by the CLI, the MCP server, and the batch runner.
//
//   morpho                       -> the real Morpho public index (honest audits)
//   local | local:<bug>          -> a local mapping (bug: none|block-id|swap-fields|duplicate)

import type { BaseRpc } from "./rpc.js";
import { MorphoApiSource } from "./subgraph/morpho.js";
import { GraphNodeSource } from "./subgraph/graphNode.js";
import { LocalMappingSource, type MappingBug } from "./subgraph/localMapping.js";
import type { SubgraphSource } from "./subgraph/source.js";

// Resolve a `graphnode:` argument to a full GraphQL endpoint. Accepts either a full
// URL ("graphnode:http://host:8000/subgraphs/name/lute/steak-honest") or a bare
// subgraph name ("graphnode:lute/steak-honest") joined to GRAPH_NODE_URL (default
// http://localhost:8000).
export function resolveGraphNodeUrl(rest: string): string {
  if (rest.startsWith("http://") || rest.startsWith("https://")) return rest;
  const base = process.env.GRAPH_NODE_URL ?? "http://localhost:8000";
  return `${base.replace(/\/$/, "")}/subgraphs/name/${rest}`;
}

export function makeSource(
  subgraph: string,
  contract: string,
  eventName: string,
  rpc: BaseRpc,
): SubgraphSource {
  if (subgraph === "morpho" || subgraph.includes("api.morpho.org")) {
    return new MorphoApiSource(contract, rpc);
  }
  if (subgraph.startsWith("graphnode:")) {
    return new GraphNodeSource(resolveGraphNodeUrl(subgraph.slice("graphnode:".length)), eventName);
  }
  if (subgraph.startsWith("local")) {
    const bug = (subgraph.split(":")[1] ?? "none") as MappingBug;
    return new LocalMappingSource(contract, eventName, rpc, bug);
  }
  throw new Error(
    `unknown subgraph "${subgraph}" (use morpho | graphnode:<name|url> | local[:block-id|swap-fields|duplicate])`,
  );
}
