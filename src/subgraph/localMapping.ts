// LocalMappingSource — a controllable stand-in for a Subgraph's mapping code.
//
// WHY THIS EXISTS: to prove Lute catches a *mapping* bug, we need an index we can
// inject a bug into. We cannot bug a third party's live index (Morpho), so this
// module simulates a subgraph mapping: it reads the same raw logs a Graph Node would
// receive and runs handler logic that builds indexed entities, with a selectable,
// realistic, LOCAL bug.
//
// INDEPENDENCE: the planted bugs live entirely in this mapping's entity-handling
// logic. The verifier (canonical.ts + abi.ts + rpc.ts) never imports or executes any
// of it, and derives its expected values purely from raw logs. A bug here therefore
// cannot hide in the verifier's expected values.
//
// store semantics: like The Graph's `store.set(id, entity)`, a later write to the
// same entity id overwrites the earlier one (last-write-wins).

import { decodeLog, getEventDef } from "../abi.js";
import { byBlockThenLog } from "../canonical.js";
import type { BaseRpc } from "../rpc.js";
import type { IndexedEvent } from "../types.js";
import { SubgraphError, type SubgraphFetchResult, type SubgraphSource } from "./source.js";

export type MappingBug =
  | "none" // faithful mapping
  | "block-id" // entity id = block number  -> same-block events collide, one is lost
  | "swap-fields" // assets/shares written in the wrong order
  | "duplicate"; // emits a duplicate entity for one event

type Decoded = {
  blockNumber: string;
  transactionHash: string;
  logIndex: number;
  fields: Record<string, string>;
};

export class LocalMappingSource implements SubgraphSource {
  readonly endpoint: string;
  readonly entity = "VaultEvent (local mapping)";

  constructor(
    private readonly vault: string,
    private readonly eventName: string,
    private readonly rpc: BaseRpc,
    private readonly bug: MappingBug = "none",
  ) {
    this.endpoint = `local-mapping://${bug}`;
  }

  /** Entity id assignment — this is where the "block-id" bug lives. */
  private entityId(d: Decoded): string {
    if (this.bug === "block-id") {
      // BUG: block number is not unique per event; two events in one block collide.
      return `${d.blockNumber}`;
    }
    // correct: transaction hash + log index
    return `${d.transactionHash}-${d.logIndex}`;
  }

  /** Field extraction — this is where the "swap-fields" bug lives. */
  private mapFields(d: Decoded): Record<string, string> {
    const out: Record<string, string> = {};
    if (this.bug === "swap-fields") {
      // BUG: assets and shares assigned to the wrong slots.
      if (d.fields.shares !== undefined) out.assets = d.fields.shares;
      if (d.fields.assets !== undefined) out.shares = d.fields.assets;
    } else {
      if (d.fields.assets !== undefined) out.assets = d.fields.assets;
      if (d.fields.shares !== undefined) out.shares = d.fields.shares;
    }
    return out;
  }

  async fetchEvents(eventName: string, fromBlock: bigint, toBlock: bigint): Promise<SubgraphFetchResult> {
    if (eventName !== this.eventName) {
      throw new SubgraphError(
        `local mapping configured for ${this.eventName}, asked for ${eventName}`,
        "query_failed",
      );
    }
    const def = getEventDef(eventName);
    const { logs } = await this.rpc.getLogs({
      address: this.vault,
      topic0: def.topic0,
      fromBlock,
      toBlock,
    });

    const decoded: Decoded[] = logs.map((l) => ({
      blockNumber: BigInt(l.blockNumber).toString(10),
      transactionHash: l.transactionHash.toLowerCase(),
      logIndex: Number(BigInt(l.logIndex)),
      fields: decodeLog(def, l),
    }));
    decoded.sort(byBlockThenLog);

    // Run the "mapping handlers" in chain order, writing to an entity store.
    const store = new Map<string, IndexedEvent>();
    for (const d of decoded) {
      const id = this.entityId(d);
      store.set(id, {
        entityId: id,
        blockNumber: d.blockNumber,
        transactionHash: d.transactionHash,
        logIndex: d.logIndex,
        eventName,
        fields: this.mapFields(d),
        source: "SUBGRAPH",
      });
    }

    let events = [...store.values()];

    if (this.bug === "duplicate" && decoded.length > 0) {
      // BUG: a handler double-writes one event under a second, distinct id.
      const mid = decoded[Math.floor(decoded.length / 2)]!;
      events.push({
        entityId: `${mid.transactionHash}-${mid.logIndex}-dup`,
        blockNumber: mid.blockNumber,
        transactionHash: mid.transactionHash,
        logIndex: mid.logIndex,
        eventName,
        fields: this.mapFields(mid),
        source: "SUBGRAPH",
      });
    }

    return {
      events,
      pageCount: 1,
      blockFilters: `local mapping over raw logs, blockNumber in [${fromBlock}, ${toBlock}], bug=${this.bug}`,
    };
  }
}
