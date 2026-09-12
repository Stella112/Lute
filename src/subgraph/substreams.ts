// SubstreamsSource — consumes Pinax's reusable ERC-4626 map module and exposes
// the same IndexedEvent shape used by Graph Node and the local test mapping.
//
// The Substreams package is an independent candidate index. Lute still derives
// expected events from raw RPC logs; this adapter only turns the candidate stream
// into the reconciler's input representation.

import { createGrpcTransport } from "@connectrpc/connect-node";
import {
  createAuthInterceptor,
  createRegistry,
  createRequest,
  createSubstream,
  isEmptyMessage,
  streamBlocks,
  unpackMapOutput,
} from "@substreams/core";

import type { IndexedEvent } from "../types.js";
import { SubgraphError, type SubgraphFetchResult, type SubgraphSource } from "./source.js";

const DEFAULT_PACKAGE =
  "https://raw.githubusercontent.com/pinax-network/substreams-evm/970a665e15619de8ad7f686bd89412a1030d46dc/spkg/erc4626-v0.1.0.spkg";
const DEFAULT_ENDPOINT = "https://base.substreams.pinax.network:443";
const DEFAULT_MODULE = "map_events";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SubgraphError(`Substreams output ${label} is not an object`, "malformed");
  }
  return value as JsonRecord;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new SubgraphError(`Substreams output ${label} is not an array`, "malformed");
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return String(value);
  throw new SubgraphError(`Substreams output ${label} is missing`, "malformed");
}

function bytesToHex(value: unknown, label: string): string {
  if (value instanceof Uint8Array) {
    return `0x${Buffer.from(value).toString("hex")}`;
  }
  const encoded = asString(value, label);
  if (/^0x[0-9a-fA-F]*$/.test(encoded)) return encoded.toLowerCase();
  try {
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0 && encoded.length !== 0) throw new Error("empty decoded bytes");
    return `0x${bytes.toString("hex")}`;
  } catch {
    throw new SubgraphError(`Substreams output ${label} is not valid bytes`, "malformed");
  }
}

function address(value: unknown, label: string): string {
  const hex = bytesToHex(value, label);
  if (hex.length !== 42) throw new SubgraphError(`Substreams output ${label} is not an address`, "malformed");
  return hex;
}

function uint(value: unknown, label: string): string {
  const result = asString(value, label);
  if (!/^[0-9]+$/.test(result)) throw new SubgraphError(`Substreams output ${label} is not a decimal integer`, "malformed");
  return result;
}

function logIndex(value: unknown, label: string): number {
  const result = Number(uint(value, label));
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new SubgraphError(`Substreams output ${label} is outside the safe integer range`, "malformed");
  }
  return result;
}

/** Convert one decoded erc4626.v1.Events JSON message into candidate events. */
export function normalizeSubstreamsEvents(
  message: unknown,
  blockNumber: string,
  contract: string,
  eventName: string,
): IndexedEvent[] {
  const root = asRecord(message, "Events");
  const transactions = asArray(root.transactions, "transactions");
  const target = contract.toLowerCase();
  const events: IndexedEvent[] = [];

  for (const transactionValue of transactions) {
    const transaction = asRecord(transactionValue, "transaction");
    const transactionHash = bytesToHex(transaction.hash, "transaction.hash");
    for (const logValue of asArray(transaction.logs, "transaction.logs")) {
      const log = asRecord(logValue, "log");
      const logAddress = address(log.address, "log.address");
      if (logAddress !== target) continue;

      const payload = log[eventName === "Withdraw" ? "withdraw" : "deposit"];
      if (payload === undefined) continue;
      const decoded = asRecord(payload, `${eventName} payload`);
      const fields: Record<string, string> = {
        assets: uint(decoded.assets, `${eventName}.assets`),
        shares: uint(decoded.shares, `${eventName}.shares`),
        sender: address(decoded.sender, `${eventName}.sender`),
      };
      if (eventName === "Withdraw") {
        fields.receiver = address(decoded.receiver, "Withdraw.receiver");
        fields.owner = address(decoded.owner, "Withdraw.owner");
      } else {
        fields.owner = address(decoded.owner, "Deposit.owner");
      }

      const index = logIndex(log.blockIndex, "log.blockIndex");
      events.push({
        entityId: `${transactionHash}-${index}`,
        blockNumber,
        transactionHash,
        logIndex: index,
        eventName,
        fields,
        source: "SUBGRAPH",
      });
    }
  }
  return events;
}

function endpointUrl(value: string): string {
  if (/^https?:\/\//.test(value)) return value;
  return `https://${value}`;
}

export type SubstreamsOptions = {
  endpoint?: string;
  packageUrl?: string;
  module?: string;
  token?: string;
  fetchImpl?: typeof fetch;
};

export class SubstreamsSource implements SubgraphSource {
  readonly entity: string;
  private readonly endpointUrl: string;
  private readonly packageUrl: string;
  private readonly module: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly contract: string,
    private readonly configuredEventName: string,
    options: SubstreamsOptions = {},
  ) {
    this.endpointUrl = endpointUrl(options.endpoint ?? process.env.SUBSTREAMS_ENDPOINT ?? DEFAULT_ENDPOINT);
    this.packageUrl = options.packageUrl ?? process.env.SUBSTREAMS_PACKAGE ?? DEFAULT_PACKAGE;
    this.module = options.module ?? process.env.SUBSTREAMS_MODULE ?? DEFAULT_MODULE;
    this.token = options.token ?? process.env.SUBSTREAMS_API_TOKEN ?? "";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.entity = `erc4626:${this.module}`;
  }

  get endpoint(): string {
    return `${this.endpointUrl} (${this.packageUrl})`;
  }

  async fetchEvents(eventName: string, fromBlock: bigint, toBlock: bigint): Promise<SubgraphFetchResult> {
    if (eventName !== this.configuredEventName) {
      throw new SubgraphError(`Substreams source configured for ${this.configuredEventName}, asked for ${eventName}`, "query_failed");
    }
    if (fromBlock < 0n || toBlock < fromBlock) {
      throw new SubgraphError("invalid Substreams block range", "query_failed");
    }
    if (!this.token) throw new SubgraphError("SUBSTREAMS_API_TOKEN is not configured", "query_failed");

    let substream;
    try {
      const packageResponse = await this.fetchImpl(this.packageUrl, {
        method: "GET",
        headers: { "User-Agent": "lute/0.1" },
      });
      if (!packageResponse.ok) {
        throw new Error(`HTTP ${packageResponse.status}`);
      }
      substream = createSubstream(await packageResponse.arrayBuffer());
    } catch (error) {
      throw new SubgraphError(`failed to fetch Substreams package: ${(error as Error).message}`, "query_failed");
    }

    const registry = createRegistry(substream);
    const transport = createGrpcTransport({
      baseUrl: this.endpointUrl,
      httpVersion: "2",
      interceptors: [createAuthInterceptor(this.token)],
      jsonOptions: { typeRegistry: registry },
    });
    const request = createRequest({
      substreamPackage: substream,
      outputModule: this.module,
      productionMode: true,
      finalBlocksOnly: true,
      startBlockNum: fromBlock,
      // Substreams stop blocks are exclusive; Lute ranges are inclusive.
      stopBlockNum: toBlock + 1n,
    });

    const events: IndexedEvent[] = [];
    let blockCount = 0;
    try {
      for await (const response of streamBlocks(transport, request)) {
        if (response.message.case === "fatalError") {
          throw new SubgraphError(
            `Substreams fatal error in ${response.message.value.module || "unknown module"}: ${response.message.value.reason}`,
            "query_failed",
          );
        }
        if (response.message.case !== "blockScopedData") continue;
        const scoped = response.message.value;
        const blockNumber = scoped.clock?.number;
        if (blockNumber === undefined) throw new SubgraphError("Substreams response is missing block number", "malformed");
        blockCount++;
        const output = unpackMapOutput(response, registry);
        if (output === undefined || isEmptyMessage(output)) continue;
        const json = output.toJson({ typeRegistry: registry, emitDefaultValues: true });
        events.push(...normalizeSubstreamsEvents(json, String(blockNumber), this.contract, eventName));
      }
    } catch (error) {
      if (error instanceof SubgraphError) throw error;
      throw new SubgraphError(`Substreams stream failed: ${(error as Error).message}`, "query_failed");
    }

    return {
      events,
      pageCount: blockCount,
      blockFilters: `startBlock=${fromBlock}, stopBlock=${toBlock} (inclusive), finalBlocksOnly=true`,
    };
  }
}
