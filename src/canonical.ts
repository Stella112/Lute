// RAW_RPC path: reconstruct canonical event facts directly from raw Base logs.
//
// This is Lute's INDEPENDENT source of truth. It uses only the RPC reader and the
// ABI decoder — never the candidate Subgraph's mapping, and never a value observed
// from the Subgraph.

import { decodeLog, getEventDef, type EventDef, type RawLog } from "./abi.js";
import { hexToSafeNumber } from "./bigint.js";
import type { BaseRpc } from "./rpc.js";
import type { CanonicalEvent, Network } from "./types.js";
import { normalizeAddress } from "./address.js";

export function logToCanonical(def: EventDef, contract: string, log: RawLog): CanonicalEvent {
  return {
    network: "base" as Network,
    contract: normalizeAddress(contract),
    eventName: def.name,
    blockNumber: BigInt(log.blockNumber).toString(10),
    blockHash: log.blockHash,
    transactionHash: log.transactionHash.toLowerCase(),
    transactionIndex: hexToSafeNumber(log.transactionIndex),
    logIndex: hexToSafeNumber(log.logIndex),
    fields: decodeLog(def, log),
    source: "RAW_RPC",
  };
}

export type RawResult = {
  events: CanonicalEvent[];
  chunkCount: number;
  topic0: string;
};

/** Read + decode all matching events for the contract over [fromBlock, toBlock]. */
export async function readCanonicalEvents(
  rpc: BaseRpc,
  contract: string,
  eventName: string,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RawResult> {
  const def = getEventDef(eventName);
  const { logs, chunkCount } = await rpc.getLogs({
    address: contract,
    topic0: def.topic0,
    fromBlock,
    toBlock,
  });
  const events = logs.map((l) => logToCanonical(def, contract, l));
  // deterministic order by (block, logIndex)
  events.sort(byBlockThenLog);
  return { events, chunkCount, topic0: def.topic0 };
}

export function byBlockThenLog(
  a: { blockNumber?: string; logIndex?: number },
  b: { blockNumber?: string; logIndex?: number },
): number {
  const ba = BigInt(a.blockNumber ?? "0");
  const bb = BigInt(b.blockNumber ?? "0");
  if (ba !== bb) return ba < bb ? -1 : 1;
  return (a.logIndex ?? 0) - (b.logIndex ?? 0);
}
