// Validation for the public paid-audit boundary.
//
// The CLI is an operator-controlled surface. This module is for the network-facing
// paid service, where malformed input must become a client error rather than a 500,
// and unbounded ranges must not turn a small payment into an unbounded RPC workload.

export const DEFAULT_CONTRACT = "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183";
export const DEFAULT_FROM_BLOCK = 51115000n;
export const DEFAULT_TO_BLOCK = 51125000n;
export const DEFAULT_MAX_BLOCK_SPAN = 100_000n;
export const DEFAULT_MAX_BODY_BYTES = 32 * 1024;

export type PaidAuditBody = {
  contract: string;
  event: "Deposit" | "Withdraw";
  fromBlock: bigint;
  toBlock: bigint;
  subgraph: string;
};

export class PaidRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 = 400,
  ) {
    super(message);
    this.name = "PaidRequestError";
  }
}

function parseBlock(name: string, value: unknown, fallback: bigint): bigint {
  if (value === undefined) return fallback;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new PaidRequestError(`${name} must be a non-negative safe integer or decimal string`);
    }
    return BigInt(value);
  }
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new PaidRequestError(`${name} must be a non-negative decimal string`);
  }
  return BigInt(value);
}

/** Parse and validate a paid audit request without performing any external work. */
export function parsePaidAuditBody(
  raw: string,
  opts: { maxBlockSpan?: bigint } = {},
): PaidAuditBody {
  let value: unknown;
  try {
    value = JSON.parse(raw || "{}");
  } catch {
    throw new PaidRequestError("request body must be valid JSON");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new PaidRequestError("request body must be a JSON object");
  }

  const body = value as Record<string, unknown>;
  const contract = body.contract ?? DEFAULT_CONTRACT;
  if (typeof contract !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(contract)) {
    throw new PaidRequestError("contract must be a valid 20-byte hex address");
  }

  const event = body.event ?? "Deposit";
  if (event !== "Deposit" && event !== "Withdraw") {
    throw new PaidRequestError('event must be "Deposit" or "Withdraw"');
  }

  const fromBlock = parseBlock("fromBlock", body.fromBlock, DEFAULT_FROM_BLOCK);
  const toBlock = parseBlock("toBlock", body.toBlock, DEFAULT_TO_BLOCK);
  if (toBlock < fromBlock) throw new PaidRequestError("toBlock must be greater than or equal to fromBlock");

  const maxBlockSpan = opts.maxBlockSpan ?? DEFAULT_MAX_BLOCK_SPAN;
  if (maxBlockSpan < 1n) throw new Error("maxBlockSpan must be positive");
  const span = toBlock - fromBlock + 1n;
  if (span > maxBlockSpan) {
    throw new PaidRequestError(`block range is too large (maximum ${maxBlockSpan} blocks)`, 413);
  }

  const subgraph = body.subgraph ?? "morpho";
  if (typeof subgraph !== "string" || subgraph.length === 0 || subgraph.length > 200) {
    throw new PaidRequestError("subgraph must be a non-empty name up to 200 characters");
  }
  // The paid server intentionally does not accept a caller-supplied remote URL.
  // A graph-node name is resolved against the operator-configured GRAPH_NODE_URL.
  if (subgraph.startsWith("graphnode:") && subgraph.length === "graphnode:".length) {
    throw new PaidRequestError("graphnode source requires a deployment name");
  }
  if (subgraph.startsWith("graphnode:") && /^(?:https?:\/\/|\\\\)/i.test(subgraph.slice("graphnode:".length))) {
    throw new PaidRequestError("graphnode URLs are not allowed; use graphnode:<deployment-name>");
  }
  if (
    subgraph !== "morpho" &&
    subgraph !== "substreams" &&
    !subgraph.startsWith("graphnode:") &&
    !["local", "local:block-id", "local:swap-fields", "local:duplicate"].includes(subgraph)
  ) {
    throw new PaidRequestError("unsupported subgraph source");
  }

  return { contract, event, fromBlock, toBlock, subgraph };
}
