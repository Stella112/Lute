// Read-only adapter for the deployed Graph Studio subgraph used by the
// Verify Before Trust Recipe. The public HTTP surface exposes query parameters;
// this module keeps the GraphQL POST and provider URL server-side.

export const DEFAULT_GRAPH_STUDIO_URL = "https://api.studio.thegraph.com/query/1760216/lute/v0.1.1";
export const DEFAULT_GRAPH_STUDIO_CONTRACT = "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183";

export type GraphProviderInput = {
  contract: string;
  eventName: "Deposit" | "Withdraw";
  fromBlock: bigint;
  toBlock: bigint;
};

type GraphEntity = {
  id: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  sender: string;
  owner: string;
  receiver?: string;
  assets: string;
  shares: string;
};

type GraphResponse = {
  data?: Record<string, GraphEntity[]>;
  errors?: unknown;
};

export class GraphProviderError extends Error {
  constructor(message: string, readonly status: 400 | 502 = 502) {
    super(message);
  }
}

function endpoint(): string {
  const value = process.env.LUTE_GRAPH_STUDIO_URL ?? DEFAULT_GRAPH_STUDIO_URL;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.hostname !== "api.studio.thegraph.com") {
      throw new Error("must use the Graph Studio HTTPS host");
    }
    return parsed.toString();
  } catch (error) {
    throw new GraphProviderError(`invalid Graph Studio endpoint: ${(error as Error).message}`, 502);
  }
}

function configuredContract(): string {
  const value = process.env.LUTE_GRAPH_STUDIO_CONTRACT ?? DEFAULT_GRAPH_STUDIO_CONTRACT;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new GraphProviderError("invalid configured Graph Studio contract", 502);
  return value.toLowerCase();
}

function fields(eventName: "Deposit" | "Withdraw"): string {
  return eventName === "Withdraw"
    ? "id blockNumber blockHash transactionHash transactionIndex logIndex sender receiver owner assets shares"
    : "id blockNumber blockHash transactionHash transactionIndex logIndex sender owner assets shares";
}

export function buildGraphProviderRequest(input: GraphProviderInput): { endpoint: string; query: string; variables: { lo: string; hi: string } } {
  if (input.contract.toLowerCase() !== configuredContract()) {
    throw new GraphProviderError("Graph Studio adapter is configured for the Lute demo contract", 400);
  }
  const entity = input.eventName === "Withdraw" ? "withdrawEvents" : "depositEvents";
  const lo = input.fromBlock.toString(10);
  const hi = input.toBlock.toString(10);
  return {
    endpoint: endpoint(),
    query: `query($lo: BigInt!, $hi: BigInt!) { ${entity}(first: 1000, orderBy: id, orderDirection: asc, where: { blockNumber_gte: $lo, blockNumber_lte: $hi }) { ${fields(input.eventName)} } }`,
    variables: { lo, hi },
  };
}

function normalizeEvent(row: GraphEntity, eventName: "Deposit" | "Withdraw"): Record<string, unknown> {
  if (!row.transactionHash || !row.blockNumber || !row.id) throw new GraphProviderError("Graph Studio returned an incomplete event", 502);
  return {
    id: row.id,
    blockNumber: String(row.blockNumber),
    blockHash: row.blockHash,
    transactionHash: row.transactionHash.toLowerCase(),
    transactionIndex: Number(row.transactionIndex),
    logIndex: Number(row.logIndex),
    sender: row.sender.toLowerCase(),
    ...(eventName === "Withdraw" ? { receiver: row.receiver?.toLowerCase() } : {}),
    owner: row.owner.toLowerCase(),
    assets: String(row.assets),
    shares: String(row.shares),
  };
}

export async function queryGraphStudio(input: GraphProviderInput, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown>> {
  if (input.toBlock < input.fromBlock) throw new GraphProviderError("toBlock must be greater than or equal to fromBlock", 400);
  const request = buildGraphProviderRequest(input);
  let response: Response;
  try {
    response = await fetchImpl(request.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json", "user-agent": "lute/0.1" },
      body: JSON.stringify({ query: request.query, variables: request.variables }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new GraphProviderError(`Graph Studio request failed: ${(error as Error).message}`);
  }
  if (!response.ok) throw new GraphProviderError(`Graph Studio HTTP ${response.status}`);
  let body: GraphResponse;
  try {
    body = (await response.json()) as GraphResponse;
  } catch (error) {
    throw new GraphProviderError(`Graph Studio returned invalid JSON: ${(error as Error).message}`);
  }
  if (body.errors) throw new GraphProviderError(`Graph Studio GraphQL error: ${JSON.stringify(body.errors)}`);
  const entity = input.eventName === "Withdraw" ? "withdrawEvents" : "depositEvents";
  const rows = body.data?.[entity];
  if (!Array.isArray(rows)) throw new GraphProviderError(`Graph Studio response is missing ${entity}`);
  return {
    provider: "The Graph Subgraph Studio",
    network: "base",
    endpoint: request.endpoint,
    contract: input.contract,
    event: input.eventName,
    range: { fromBlock: request.variables.lo, toBlock: request.variables.hi },
    events: rows.map((row) => normalizeEvent(row, input.eventName)),
    eventCount: rows.length,
  };
}
