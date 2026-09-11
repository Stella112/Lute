// MorphoApiSource — the real, external, independently-operated index used for the
// honest audit.
//
// Morpho's public GraphQL indexer (api.morpho.org) exposes `vaultV1Transactions`, one
// record per ERC-4626 vault Deposit/Withdraw with { txHash, blockNumber, txIndex,
// logIndex, assets, shares, type }. Lute does not control this index and shares no
// mapping code with it — it is a genuinely independent second party.
//
// Adapter note: the API filters by `timestamp`, not block number. We translate the
// audited block range into a timestamp window (via the verifier RPC's block
// timestamps, widened by a margin) and then filter the returned records back to the
// exact block range. Identity remains transactionHash + logIndex.

import type { BaseRpc } from "../rpc.js";
import type { IndexedEvent } from "../types.js";
import { SubgraphError, type SubgraphFetchResult, type SubgraphSource } from "./source.js";

const MORPHO_ENDPOINT = "https://api.morpho.org/graphql";
const BASE_CHAIN_ID = 8453;
const PAGE_SIZE = 100;
const TS_MARGIN = 60; // seconds of slack around the block-derived timestamp window

type ApiTxn = {
  txHash: string;
  blockNumber: number;
  txIndex: number;
  logIndex: number;
  type: string;
  assets: string | null;
  shares: string | null;
};

const QUERY = `query($cursor: VaultV1TransactionCursorInput, $lo: Int!, $hi: Int!, $type: [VaultV1TransactionType!]) {
  vaultV1Transactions(
    first: ${PAGE_SIZE}
    orderBy: Time
    orderDirection: Asc
    where: { chainId_in: [${BASE_CHAIN_ID}], type_in: $type, vaultAddress_in: [$VAULT], timestamp_gte: $lo, timestamp_lte: $hi, cursor: $cursor }
  ) {
    items { txHash blockNumber txIndex logIndex type assets shares }
    pageInfo { hasNextPage }
  }
}`;

export class MorphoApiSource implements SubgraphSource {
  readonly endpoint = MORPHO_ENDPOINT;
  readonly entity = "vaultV1Transactions";
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly vault: string,
    private readonly rpc: BaseRpc,
    fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  private async gql(variables: Record<string, unknown>): Promise<{ items: ApiTxn[]; hasNext: boolean }> {
    const query = QUERY.replace("$VAULT", `"${this.vault}"`);
    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "lute/0.1" },
        body: JSON.stringify({ query, variables }),
      });
    } catch (e) {
      throw new SubgraphError(`network error querying Morpho: ${(e as Error).message}`, "query_failed");
    }
    if (!res.ok) throw new SubgraphError(`Morpho API HTTP ${res.status}`, "page_failed");
    const body = (await res.json()) as {
      data?: { vaultV1Transactions?: { items: ApiTxn[]; pageInfo: { hasNextPage: boolean } } };
      errors?: unknown;
    };
    if (body.errors) {
      throw new SubgraphError(`Morpho GraphQL errors: ${JSON.stringify(body.errors)}`, "query_failed");
    }
    const conn = body.data?.vaultV1Transactions;
    if (!conn) throw new SubgraphError("Morpho response missing vaultV1Transactions", "malformed");
    return { items: conn.items, hasNext: conn.pageInfo.hasNextPage };
  }

  async fetchEvents(eventName: string, fromBlock: bigint, toBlock: bigint): Promise<SubgraphFetchResult> {
    if (eventName !== "Deposit" && eventName !== "Withdraw") {
      throw new SubgraphError(`Morpho source does not index event "${eventName}"`, "query_failed");
    }
    // block range -> timestamp window
    const [lo, hi] = await Promise.all([
      this.rpc.getBlockTimestamp(fromBlock),
      this.rpc.getBlockTimestamp(toBlock),
    ]);
    const tsLo = Number(lo) - TS_MARGIN;
    const tsHi = Number(hi) + TS_MARGIN;

    const raw: ApiTxn[] = [];
    let cursor: { txHash: string; logIndex: number } | null = null;
    let pageCount = 0;
    for (;;) {
      const { items, hasNext } = await this.gql({ cursor, lo: tsLo, hi: tsHi, type: [eventName] });
      pageCount++;
      raw.push(...items);
      if (!hasNext || items.length === 0) break;
      const last = items[items.length - 1]!;
      cursor = { txHash: last.txHash, logIndex: last.logIndex };
      if (pageCount > 10000) throw new SubgraphError("Morpho pagination exceeded safety bound", "page_failed");
    }

    const from = Number(fromBlock);
    const to = Number(toBlock);
    const events: IndexedEvent[] = raw
      .filter((t) => t.blockNumber >= from && t.blockNumber <= to)
      .map((t) => {
        const fields: Record<string, string> = {};
        if (t.assets !== null && t.assets !== undefined) fields.assets = String(t.assets);
        if (t.shares !== null && t.shares !== undefined) fields.shares = String(t.shares);
        return {
          entityId: `${t.txHash.toLowerCase()}-${t.logIndex}`,
          blockNumber: String(t.blockNumber),
          transactionHash: t.txHash.toLowerCase(),
          logIndex: t.logIndex,
          eventName,
          fields,
          source: "SUBGRAPH",
        } satisfies IndexedEvent;
      });

    return {
      events,
      pageCount,
      blockFilters: `timestamp_gte=${tsLo}, timestamp_lte=${tsHi} (margin ${TS_MARGIN}s), post-filter blockNumber in [${from}, ${to}]`,
    };
  }
}
