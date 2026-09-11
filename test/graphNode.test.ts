// GraphNodeSource unit tests (offline, fake fetch).

import { test } from "node:test";
import assert from "node:assert/strict";

import { GraphNodeSource } from "../src/subgraph/graphNode.js";
import { resolveGraphNodeUrl } from "../src/sources.js";

function entity(i: number) {
  const li = i;
  return {
    id: `0x${i.toString(16).padStart(4, "0")}-${li}`,
    blockNumber: String(51115000 + i),
    transactionHash: `0xAA${i.toString(16).padStart(4, "0")}`,
    transactionIndex: 0,
    logIndex: li,
    sender: "0xABCDEF0000000000000000000000000000000001",
    owner: "0xABCDEF0000000000000000000000000000000002",
    assets: String(1000 + i),
    shares: String(2000 + i),
  };
}

test("resolveGraphNodeUrl: bare name vs full url vs env base", () => {
  assert.equal(resolveGraphNodeUrl("http://h:8000/subgraphs/name/lute/x"), "http://h:8000/subgraphs/name/lute/x");
  const prev = process.env.GRAPH_NODE_URL;
  delete process.env.GRAPH_NODE_URL;
  assert.equal(resolveGraphNodeUrl("lute/steak-honest"), "http://localhost:8000/subgraphs/name/lute/steak-honest");
  process.env.GRAPH_NODE_URL = "http://vps:8000/";
  assert.equal(resolveGraphNodeUrl("lute/steak-honest"), "http://vps:8000/subgraphs/name/lute/steak-honest");
  if (prev === undefined) delete process.env.GRAPH_NODE_URL;
  else process.env.GRAPH_NODE_URL = prev;
});

test("GraphNodeSource paginates via id_gt cursor and normalizes fields", async () => {
  const page1 = Array.from({ length: 1000 }, (_, i) => entity(i)); // full page -> continue
  const page2 = [entity(1000), entity(1001)]; // short page -> stop
  const seenCursors: string[] = [];
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { variables: { cursor: string } };
    seenCursors.push(body.variables.cursor);
    const rows = body.variables.cursor === "" ? page1 : page2;
    return new Response(JSON.stringify({ data: { depositEvents: rows } }), { status: 200 });
  }) as unknown as typeof fetch;

  const src = new GraphNodeSource("http://gn/subgraphs/name/lute/steak-honest", "Deposit", fakeFetch);
  const res = await src.fetchEvents("Deposit", 51115000n, 51125000n);

  assert.equal(res.pageCount, 2);
  assert.equal(res.events.length, 1002);
  // cursor advanced to the last id of page 1 on the second request
  assert.equal(seenCursors[0], "");
  assert.equal(seenCursors[1], page1[page1.length - 1]!.id);
  // normalization
  const e0 = res.events[0]!;
  assert.equal(e0.transactionHash, "0xaa0000");
  assert.equal(e0.fields.sender, "0xabcdef0000000000000000000000000000000001");
  assert.equal(e0.fields.assets, "1000");
  assert.equal(e0.logIndex, 0);
});

test("GraphNodeSource surfaces GraphQL errors as SubgraphError", async () => {
  const fakeFetch = (async () => new Response(JSON.stringify({ errors: [{ message: "boom" }] }), { status: 200 })) as unknown as typeof fetch;
  const src = new GraphNodeSource("http://gn", "Deposit", fakeFetch);
  await assert.rejects(() => src.fetchEvents("Deposit", 1n, 2n), /Graph Node GraphQL errors/);
});
