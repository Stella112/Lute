// Minimal, explicit Base RPC reader.
//
// - eth_getLogs restricted by contract address + event topic0 over a fixed block range
// - chunks requests to respect the provider's log-range limit
// - retries transient failures with backoff
// - FAILS CLOSED: if any chunk cannot be retrieved, the whole read throws. A failed
//   chunk is never silently omitted (that would understate the raw count and could
//   turn a real divergence into a false PASS).

import type { RawLog } from "./abi.js";
import type { Logger } from "./logger.js";

export class RpcError extends Error {
  constructor(
    message: string,
    readonly kind: "chunk_failed" | "rpc_error" | "network",
    readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export type FetchImpl = typeof fetch;

export type RpcOptions = {
  url: string;
  alias: string;
  chunkSize?: number;
  maxRetries?: number;
  fetchImpl?: FetchImpl;
  logger?: Logger;
};

type JsonRpcResponse<T> = { result?: T; error?: { code: number; message: string } };

const TRANSIENT_HTTP = new Set([429, 500, 502, 503, 504]);

export class BaseRpc {
  readonly alias: string;
  private readonly url: string;
  private readonly chunkSize: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: FetchImpl;
  private readonly logger?: Logger;

  constructor(opts: RpcOptions) {
    this.url = opts.url;
    this.alias = opts.alias;
    this.chunkSize = opts.chunkSize ?? 2000;
    this.maxRetries = opts.maxRetries ?? 4;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.logger = opts.logger;
  }

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchImpl(this.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "lute/0.1" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        if (!res.ok) {
          if (TRANSIENT_HTTP.has(res.status) && attempt < this.maxRetries) {
            await backoff(attempt);
            continue;
          }
          throw new RpcError(`HTTP ${res.status} from RPC ${this.alias}`, "network", { method });
        }
        const body = (await res.json()) as JsonRpcResponse<T>;
        if (body.error) {
          // Deterministic RPC errors are not retried — fail closed.
          throw new RpcError(`RPC error ${body.error.code}: ${body.error.message}`, "rpc_error", {
            method,
          });
        }
        if (body.result === undefined) {
          throw new RpcError(`empty RPC result for ${method}`, "rpc_error", { method });
        }
        return body.result;
      } catch (e) {
        lastErr = e;
        if (e instanceof RpcError && e.kind === "rpc_error") throw e; // do not retry deterministic errors
        if (attempt < this.maxRetries) {
          await backoff(attempt);
          continue;
        }
      }
    }
    throw new RpcError(`RPC ${this.alias} call ${method} failed after retries: ${(lastErr as Error)?.message}`, "network", { method });
  }

  async blockNumber(): Promise<bigint> {
    return BigInt(await this.call<string>("eth_blockNumber", []));
  }

  async getBlockTimestamp(block: bigint): Promise<bigint> {
    const b = await this.call<{ timestamp: string } | null>("eth_getBlockByNumber", [
      "0x" + block.toString(16),
      false,
    ]);
    if (!b) throw new RpcError(`block ${block} not found`, "rpc_error");
    return BigInt(b.timestamp);
  }

  async getTransactionReceipt(txHash: string): Promise<{ logs: RawLog[] } | null> {
    return this.call<{ logs: RawLog[] } | null>("eth_getTransactionReceipt", [txHash]);
  }

  /**
   * Retrieve every log for `address` matching `topic0` across [fromBlock, toBlock],
   * inclusive, chunking to respect the provider limit. Returns logs plus the chunk
   * count. Throws RpcError (chunk_failed) if any chunk cannot be retrieved.
   */
  async getLogs(params: {
    address: string;
    topic0: string;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<{ logs: RawLog[]; chunkCount: number }> {
    const { address, topic0, fromBlock, toBlock } = params;
    if (toBlock < fromBlock) throw new RpcError("toBlock < fromBlock", "rpc_error");

    const logs: RawLog[] = [];
    let chunkCount = 0;
    let start = fromBlock;
    while (start <= toBlock) {
      const end = min(start + BigInt(this.chunkSize) - 1n, toBlock);
      chunkCount++;
      try {
        const chunk = await this.call<RawLog[]>("eth_getLogs", [
          {
            address,
            topics: [topic0],
            fromBlock: "0x" + start.toString(16),
            toBlock: "0x" + end.toString(16),
          },
        ]);
        for (const l of chunk) logs.push(l);
        this.logger?.info("rpc.chunk", {
          source: "RAW_RPC",
          stage: "getLogs",
          start_block: start.toString(),
          end_block: end.toString(),
          status: "ok",
          chunk_logs: chunk.length,
        });
      } catch (e) {
        // Fail closed: one missing chunk invalidates the entire read.
        throw new RpcError(
          `chunk [${start}, ${end}] failed on RPC ${this.alias}: ${(e as Error).message}`,
          "chunk_failed",
          { start: start.toString(), end: end.toString() },
        );
      }
      start = end + 1n;
    }
    return { logs, chunkCount };
  }
}

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

async function backoff(attempt: number): Promise<void> {
  const ms = Math.min(2000, 150 * 2 ** attempt);
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Resolve the verifier RPC. The real URL comes from the BASE_RPC_VERIFIER env var
 * (so credentials never appear in code or logs); a public, archive-capable default
 * is used otherwise. Only the alias is ever logged.
 */
export function resolveVerifierRpc(logger?: Logger): BaseRpc {
  const url = process.env.BASE_RPC_VERIFIER ?? "https://mainnet.base.org";
  return new BaseRpc({ url, alias: "BASE_RPC_VERIFIER", logger });
}
