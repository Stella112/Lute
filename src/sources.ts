// Shared SubgraphSource factory used by the CLI, the MCP server, and the batch runner.
//
//   morpho                       -> the real Morpho public index (honest audits)
//   local | local:<bug>          -> a local mapping (bug: none|block-id|swap-fields|duplicate)

import type { BaseRpc } from "./rpc.js";
import { MorphoApiSource } from "./subgraph/morpho.js";
import { GraphNodeSource } from "./subgraph/graphNode.js";
import { LocalMappingSource, type MappingBug } from "./subgraph/localMapping.js";
import type { SubgraphSource } from "./subgraph/source.js";

// Resolve a `graphnode:` argument to a full GraphQL endpoint.
//
// SECURITY: a full URL in the argument gives the caller control over the host and
// protocol of a server-side fetch (SSRF). Full URLs are therefore accepted ONLY when
// `allowRemoteUrl` is true — reserved for the trusted CLI/env path. Network-facing
// callers (the HTTP servers, MCP) must leave it false, so a request can only name a
// bare subgraph that is joined to the server-configured GRAPH_NODE_URL.
export function resolveGraphNodeUrl(rest: string, allowRemoteUrl = false): string {
  if (rest.startsWith("http://") || rest.startsWith("https://")) {
    if (!allowRemoteUrl) {
      throw new Error("graphnode: full URLs are not allowed from this caller; use a bare subgraph name");
    }
    return rest;
  }
  const base = process.env.GRAPH_NODE_URL ?? "http://localhost:8000";
  return `${base.replace(/\/$/, "")}/subgraphs/name/${rest}`;
}

export function makeSource(
  subgraph: string,
  contract: string,
  eventName: string,
  rpc: BaseRpc,
  opts: { allowRemoteGraphNodeUrl?: boolean } = {},
): SubgraphSource {
  if (subgraph === "morpho" || subgraph.includes("api.morpho.org")) {
    return new MorphoApiSource(contract, rpc);
  }
  if (subgraph.startsWith("graphnode:")) {
    return new GraphNodeSource(
      resolveGraphNodeUrl(subgraph.slice("graphnode:".length), opts.allowRemoteGraphNodeUrl),
      eventName,
    );
  }
  if (subgraph.startsWith("local")) {
    const bug = (subgraph.split(":")[1] ?? "none") as MappingBug;
    return new LocalMappingSource(contract, eventName, rpc, bug);
  }
  throw new Error(
    `unknown subgraph "${subgraph}" (use morpho | graphnode:<name|url> | local[:block-id|swap-fields|duplicate])`,
  );
}
