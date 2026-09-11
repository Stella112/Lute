// Unit tests. Fixtures are permitted here (low-level utility verification only) and
// are NOT used to satisfy the phase acceptance criteria.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ERC4626_EVENTS, decodeLog, getEventDef, keccak256Utf8, type RawLog } from "../src/abi.js";
import { addressFromTopic, addressEquals, normalizeAddress } from "../src/address.js";
import { hexToSafeNumber, toJSON, wordToUintDecimal } from "../src/bigint.js";
import { eventIdentity, type CanonicalEvent, type CheckResult, type IndexedEvent } from "../src/types.js";
import { runChecks } from "../src/reconcile.js";
import { decideVerdict } from "../src/audit.js";
import { findFirstDivergence, type RangeFetchers } from "../src/divergence.js";
import { MorphoApiSource } from "../src/subgraph/morpho.js";
import { BaseRpc } from "../src/rpc.js";

const VAULT = "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183";
const word = (n: bigint) => n.toString(16).padStart(64, "0");
const topicAddr = (a: string) => "0x" + "0".repeat(24) + a.toLowerCase().replace(/^0x/, "");

// ---- fixture logs (values confirmed against real Base chain) ----
const depositLog: RawLog = {
  address: VAULT,
  topics: [
    ERC4626_EVENTS.Deposit!.topic0,
    topicAddr("0x8fb00481e78cb78c5a19938315140dbe9177a775"),
    topicAddr("0x8fb00481e78cb78c5a19938315140dbe9177a775"),
  ],
  data: "0x" + word(210000n) + word(190753468813053638n),
  blockNumber: "0x" + (51141538).toString(16),
  blockHash: "0xabc",
  transactionHash: "0xf4732676960131f69fd97e6feda665491a4a6a6cb5b09ccb3f3f75c6fd72f0b8",
  transactionIndex: "0x23",
  logIndex: "0x83",
};

const withdrawLog: RawLog = {
  address: VAULT,
  topics: [
    ERC4626_EVENTS.Withdraw!.topic0,
    topicAddr("0x9e274f80a7a69a4c8aa764fe80c3c4d534ef9043"),
    topicAddr("0x9e01d529c295b58180596644aa8b0ccc6bee648a"),
    topicAddr("0x9e274f80a7a69a4c8aa764fe80c3c4d534ef9043"),
  ],
  data: "0x" + word(276000000n) + word(250704477300424580500n),
  blockNumber: "0x1",
  blockHash: "0xdef",
  transactionHash: "0x1a96cedfa0f5b390f03810e49cee0281092dc2fa6cdc08c24c61b37bdac08c03",
  transactionIndex: "0x84",
  logIndex: "0x284",
};

test("topic0 is derived from keccak256(signature), not assumed", () => {
  assert.equal(
    ERC4626_EVENTS.Deposit!.topic0,
    keccak256Utf8("Deposit(address,address,uint256,uint256)"),
  );
  assert.equal(
    ERC4626_EVENTS.Withdraw!.topic0,
    keccak256Utf8("Withdraw(address,address,address,uint256,uint256)"),
  );
  // and they equal the topics actually emitted on-chain
  assert.equal(ERC4626_EVENTS.Deposit!.topic0, "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7");
  assert.equal(ERC4626_EVENTS.Withdraw!.topic0, "0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db");
});

test("ABI decoding: Deposit", () => {
  const f = decodeLog(getEventDef("Deposit"), depositLog);
  assert.equal(f.sender, "0x8fb00481e78cb78c5a19938315140dbe9177a775");
  assert.equal(f.owner, "0x8fb00481e78cb78c5a19938315140dbe9177a775");
  assert.equal(f.assets, "210000");
  assert.equal(f.shares, "190753468813053638");
});

test("ABI decoding: Withdraw (3 indexed topics)", () => {
  const f = decodeLog(getEventDef("Withdraw"), withdrawLog);
  assert.equal(f.sender, "0x9e274f80a7a69a4c8aa764fe80c3c4d534ef9043");
  assert.equal(f.receiver, "0x9e01d529c295b58180596644aa8b0ccc6bee648a");
  assert.equal(f.owner, "0x9e274f80a7a69a4c8aa764fe80c3c4d534ef9043");
  assert.equal(f.assets, "276000000");
  assert.equal(f.shares, "250704477300424580500");
});

test("ABI decoding rejects wrong topic0", () => {
  assert.throws(() => decodeLog(getEventDef("Deposit"), { ...depositLog, topics: ["0xdead", ...depositLog.topics.slice(1)] }));
});

test("canonical address normalization", () => {
  assert.equal(addressFromTopic(topicAddr("0xABCdef0000000000000000000000000000000001")), "0xabcdef0000000000000000000000000000000001");
  assert.equal(normalizeAddress("0xABCDEF0000000000000000000000000000000001"), "0xabcdef0000000000000000000000000000000001");
  assert.ok(addressEquals("0xAbC0000000000000000000000000000000000001", "0xabc0000000000000000000000000000000000001"));
  assert.throws(() => normalizeAddress("0x1234"));
});

test("BigInt serialization keeps uint256 exact as decimal string", () => {
  assert.equal(wordToUintDecimal(word(250704477300424580500n)), "250704477300424580500");
  assert.equal(toJSON({ x: 250704477300424580500n }), '{\n  "x": "250704477300424580500"\n}');
  assert.throws(() => hexToSafeNumber("0x" + (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(16)));
});

test("event identity is txHash + logIndex, never the entity id", () => {
  assert.equal(eventIdentity({ transactionHash: "0xAA", logIndex: 7 }), "0xaa:7");
  assert.equal(eventIdentity({ transactionHash: undefined, logIndex: 7 }), "UNIDENTIFIABLE");
});

// ---- reconcile / matching / duplicate / field ----
function rawEvent(tx: string, li: number, block: string, assets: string, shares: string): CanonicalEvent {
  return {
    network: "base", contract: VAULT, eventName: "Deposit", blockNumber: block, blockHash: "0x",
    transactionHash: tx, transactionIndex: 0, logIndex: li,
    fields: { sender: "0xa", owner: "0xa", assets, shares }, source: "RAW_RPC",
  };
}
function idxEvent(tx: string, li: number, block: string, fields: Record<string, string>): IndexedEvent {
  return { entityId: `${tx}-${li}`, blockNumber: block, transactionHash: tx, logIndex: li, eventName: "Deposit", fields, source: "SUBGRAPH" };
}

test("matching: identical sets pass count/presence/fields", () => {
  const raw = [rawEvent("0x1", 1, "10", "100", "1000"), rawEvent("0x2", 2, "11", "200", "2000")];
  const indexed = [idxEvent("0x1", 1, "10", { assets: "100", shares: "1000" }), idxEvent("0x2", 2, "11", { assets: "200", shares: "2000" })];
  const checks = runChecks({ eventName: "Deposit", raw, indexed });
  const s = (n: string) => checks.find((c) => c.name === n)?.status;
  assert.equal(s("event_count"), "PASS");
  assert.equal(s("event_presence"), "PASS");
  assert.equal(s("field_accuracy:assets"), "PASS");
  assert.equal(s("field_accuracy:sender"), "UNVERIFIED"); // index doesn't expose it
  assert.equal(decideVerdict(checks), "VERIFIED");
});

test("duplicate detection flags a duplicate identity", () => {
  const raw = [rawEvent("0x1", 1, "10", "100", "1000")];
  const indexed = [idxEvent("0x1", 1, "10", { assets: "100", shares: "1000" }), idxEvent("0x1", 1, "10", { assets: "100", shares: "1000" })];
  const checks = runChecks({ eventName: "Deposit", raw, indexed });
  assert.equal(checks.find((c) => c.name === "duplicate_detection")?.status, "FAIL");
  assert.equal(decideVerdict(checks), "FAILED");
});

test("field mismatch fails field_accuracy", () => {
  const raw = [rawEvent("0x1", 1, "10", "100", "1000")];
  const indexed = [idxEvent("0x1", 1, "10", { assets: "999", shares: "1000" })];
  const checks = runChecks({ eventName: "Deposit", raw, indexed });
  assert.equal(checks.find((c) => c.name === "field_accuracy:assets")?.status, "FAIL");
});

test("verdict generation: no field verified -> INCONCLUSIVE, not VERIFIED", () => {
  const checks: CheckResult[] = [
    { name: "event_count", class: "STRONG", status: "PASS" },
    { name: "event_presence", class: "STRONG", status: "PASS" },
    { name: "field_accuracy:assets", class: "STRONG", status: "UNVERIFIED" },
  ];
  assert.equal(decideVerdict(checks), "INCONCLUSIVE");
});

// ---- first-divergence bisection over in-memory sets ----
test("first-divergence search finds the middle missing event via bisection", async () => {
  // 20 events, one per block 100..119; index is missing the one at block 110.
  const raw: CanonicalEvent[] = [];
  for (let b = 100; b < 120; b++) raw.push(rawEvent("0x" + b.toString(16), b, String(b), String(b), String(b * 10)));
  const indexed: IndexedEvent[] = raw.filter((e) => e.blockNumber !== "110").map((e) => idxEvent(e.transactionHash, e.logIndex, e.blockNumber, { assets: e.fields.assets!, shares: e.fields.shares! }));
  const f: RangeFetchers = {
    fetchRaw: async (from, to) => raw.filter((e) => BigInt(e.blockNumber) >= from && BigInt(e.blockNumber) <= to),
    fetchIndexed: async (from, to) => indexed.filter((e) => BigInt(e.blockNumber!) >= from && BigInt(e.blockNumber!) <= to),
  };
  const res = await findFirstDivergence(f, "Deposit", 100n, 119n);
  assert.ok(res);
  assert.equal(res!.divergence!.blockNumber, "110");
  assert.equal(res!.divergence!.check, "event_presence");
  assert.ok(res!.steps > 0);
});

// ---- pagination normalization (Morpho source with injected fetch) ----
test("Morpho source paginates via cursor and filters to block range", async () => {
  // fake RPC answering block timestamps
  const rpc = new BaseRpc({
    url: "http://rpc", alias: "TEST_RPC",
    fetchImpl: async () => new Response(JSON.stringify({ result: { timestamp: "0x64" } }), { status: 200 }),
  });
  let call = 0;
  const pages = [
    { items: [{ txHash: "0xA", blockNumber: 10, txIndex: 0, logIndex: 1, type: "Deposit", assets: "5", shares: "50" }], pageInfo: { hasNextPage: true } },
    { items: [
        { txHash: "0xB", blockNumber: 11, txIndex: 0, logIndex: 2, type: "Deposit", assets: "6", shares: "60" },
        { txHash: "0xC", blockNumber: 99, txIndex: 0, logIndex: 3, type: "Deposit", assets: "7", shares: "70" }, // out of block range
      ], pageInfo: { hasNextPage: false } },
  ];
  const fakeFetch = (async () => new Response(JSON.stringify({ data: { vaultV1Transactions: pages[call++] } }), { status: 200 })) as unknown as typeof fetch;
  const src = new MorphoApiSource(VAULT, rpc, fakeFetch);
  const res = await src.fetchEvents("Deposit", 10n, 12n);
  assert.equal(res.pageCount, 2);
  assert.equal(res.events.length, 2); // 0xC filtered out by block range
  assert.equal(res.events[0]!.transactionHash, "0xa");
  assert.equal(res.events[0]!.fields.assets, "5");
});
