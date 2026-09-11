// GraphNodeSource — queries a real Graph Node's GraphQL endpoint for the entities
// produced by the Lute subgraph (see /subgraph). Unlike the Morpho index, this
// subgraph exposes the address fields too (sender/owner/receiver), so Lute can verify
// field_accuracy on them as well.
//
// This is a genuinely independent candidate: the entities come from AssemblyScript
// mapping code running inside graph-node. The Lute verifier never runs that mapping —
// it reconstructs expected values from raw RPC logs — so a bug in the mapping (e.g. the
// planted entity-id bug in the bugged deployment) cannot hide in the verifier.

import type { IndexedEvent } from "../types.js";
import { SubgraphError, type SubgraphFetchResult, type SubgraphSource } from "./source.js";

const PAGE_SIZE = 1000; // graph-node max `first`

type Entity = {
  id: string;
  blockNumber: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  sender: string;
  owner: string;
  receiver?: string;
  assets: string;
  shares: string;
};

export class GraphNodeSource implements SubgraphSource {
  readonly entity: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    readonly endpoint: string,
    private readonly eventName: string,
    fetchImpl?: typeof fetch,
  ) {
    this.entity = eventName === "Withdraw" ? "withdrawEvents" : "depositEvents";
    this.fetchImpl = fetchImpl ?? fetch;
  }

  private fields(): string {
    const addr = this.eventName === "Withdraw" ? "sender receiver owner" : "sender owner";
    return `id blockNumber transactionHash transactionIndex logIndex ${addr} assets shares`;
  }

  private async gql(lo: string, hi: string, cursor: string): Promise<Entity[]> {
    const query = `query($lo: BigInt!, $hi: BigInt!, $cursor: String!) {
      ${this.entity}(first: ${PAGE_SIZE}, orderBy: id, orderDirection: asc,
        where: { blockNumber_gte: $lo, blockNumber_lte: $hi, id_gt: $cursor }) {
        ${this.fields()}
      }
    }`;
    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "lute/0.1" },
        body: JSON.stringify({ query, variables: { lo, hi, cursor } }),
      });
    } catch (e) {
      throw new SubgraphError(`network error querying Graph Node: ${(e as Error).message}`, "query_failed");
    }
    if (!res.ok) throw new SubgraphError(`Graph Node HTTP ${res.status}`, "page_failed");
    const body = (await res.json()) as { data?: Record<string, Entity[]>; errors?: unknown };
    if (body.errors) throw new SubgraphError(`Graph Node GraphQL errors: ${JSON.stringify(body.errors)}`, "query_failed");
    const rows = body.data?.[this.entity];
    if (!rows) throw new SubgraphError(`Graph Node response missing ${this.entity}`, "malformed");
    return rows;
  }

  async fetchEvents(eventName: string, fromBlock: bigint, toBlock: bigint): Promise<SubgraphFetchResult> {
    if (eventName !== this.eventName) {
      throw new SubgraphError(`Graph Node source configured for ${this.eventName}, asked for ${eventName}`, "query_failed");
    }
    const lo = fromBlock.toString();
    const hi = toBlock.toString();
    const all: Entity[] = [];
    let cursor = "";
    let pageCount = 0;
    for (;;) {
      const rows = await this.gql(lo, hi, cursor);
      pageCount++;
      all.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      cursor = rows[rows.length - 1]!.id;
      if (pageCount > 10000) throw new SubgraphError("Graph Node pagination exceeded safety bound", "page_failed");
    }

    const events: IndexedEvent[] = all.map((r) => {
      const fields: Record<string, string> = {
        assets: String(r.assets),
        shares: String(r.shares),
        sender: r.sender.toLowerCase(),
        owner: r.owner.toLowerCase(),
      };
      if (r.receiver !== undefined) fields.receiver = r.receiver.toLowerCase();
      return {
        entityId: r.id,
        blockNumber: String(r.blockNumber),
        transactionHash: r.transactionHash.toLowerCase(),
        logIndex: Number(r.logIndex),
        eventName,
        fields,
        source: "SUBGRAPH",
      } satisfies IndexedEvent;
    });

    return {
      events,
      pageCount,
      blockFilters: `blockNumber_gte=${lo}, blockNumber_lte=${hi}, id_gt cursor pagination`,
    };
  }
}
