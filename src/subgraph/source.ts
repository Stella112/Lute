// A SubgraphSource is the CANDIDATE being audited: any index that claims to reflect
// the same on-chain events. The reconciler consumes only IndexedEvent[] and does not
// care whether the source is a hosted GraphQL indexer or a local mapping — the SAME
// verifier runs against every source.

import type { IndexedEvent } from "../types.js";

export class SubgraphError extends Error {
  constructor(
    message: string,
    readonly kind: "query_failed" | "page_failed" | "malformed",
  ) {
    super(message);
    this.name = "SubgraphError";
  }
}

export type SubgraphFetchResult = {
  events: IndexedEvent[];
  pageCount: number;
  blockFilters: string;
};

export interface SubgraphSource {
  /** Human-readable identity for provenance (endpoint / deployment id). */
  readonly endpoint: string;
  /** Entity/entities queried, for provenance. */
  readonly entity: string;
  fetchEvents(eventName: string, fromBlock: bigint, toBlock: bigint): Promise<SubgraphFetchResult>;
}
