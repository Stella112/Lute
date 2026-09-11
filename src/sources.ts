// Shared SubgraphSource factory used by the CLI, the MCP server, and the batch runner.
//
//   morpho                       -> the real Morpho public index (honest audits)
//   local | local:<bug>          -> a local mapping (bug: none|block-id|swap-fields|duplicate)

import type { BaseRpc } from "./rpc.js";
import { MorphoApiSource } from "./subgraph/morpho.js";
import { LocalMappingSource, type MappingBug } from "./subgraph/localMapping.js";
import type { SubgraphSource } from "./subgraph/source.js";

export function makeSource(
  subgraph: string,
  contract: string,
  eventName: string,
  rpc: BaseRpc,
): SubgraphSource {
  if (subgraph === "morpho" || subgraph.includes("api.morpho.org")) {
    return new MorphoApiSource(contract, rpc);
  }
  if (subgraph.startsWith("local")) {
    const bug = (subgraph.split(":")[1] ?? "none") as MappingBug;
    return new LocalMappingSource(contract, eventName, rpc, bug);
  }
  throw new Error(`unknown subgraph "${subgraph}" (use morpho | local[:block-id|swap-fields|duplicate])`);
}
