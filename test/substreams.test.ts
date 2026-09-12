import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSubstreamsEvents } from "../src/subgraph/substreams.js";

const b64 = (hex: string) => Buffer.from(hex.replace(/^0x/, ""), "hex").toString("base64");
const contract = "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183";
const sender = "0x1111111111111111111111111111111111111111";
const owner = "0x2222222222222222222222222222222222222222";

test("normalizes Pinax ERC-4626 Deposit output and filters by vault", () => {
  const events = normalizeSubstreamsEvents(
    {
      transactions: [
        {
          hash: b64("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
          logs: [
            {
              address: b64(contract),
              blockIndex: 7,
              deposit: { sender: b64(sender), owner: b64(owner), assets: "123", shares: "456" },
            },
            {
              address: b64("0x9999999999999999999999999999999999999999"),
              blockIndex: 8,
              deposit: { sender: b64(sender), owner: b64(owner), assets: "999", shares: "999" },
            },
          ],
        },
      ],
    },
    "51120808",
    contract,
    "Deposit",
  );
  assert.deepEqual(events, [
    {
      entityId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-7",
      blockNumber: "51120808",
      transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      logIndex: 7,
      eventName: "Deposit",
      fields: { sender: sender.toLowerCase(), owner: owner.toLowerCase(), assets: "123", shares: "456" },
      source: "SUBGRAPH",
    },
  ]);
});

test("normalizes Withdraw address fields", () => {
  const receiver = "0x3333333333333333333333333333333333333333";
  const events = normalizeSubstreamsEvents(
    {
      transactions: [
        {
          hash: b64("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
          logs: [{
            address: b64(contract),
            blockIndex: 9,
            withdraw: { sender: b64(sender), receiver: b64(receiver), owner: b64(owner), assets: "10", shares: "11" },
          }],
        },
      ],
    },
    "51120809",
    contract,
    "Withdraw",
  );
  assert.equal(events[0]?.fields.receiver, receiver);
  assert.equal(events[0]?.fields.owner, owner.toLowerCase());
});

test("rejects malformed candidate output instead of producing partial evidence", () => {
  assert.throws(
    () => normalizeSubstreamsEvents({ transactions: [{ hash: b64("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), logs: [{ address: "not-base64", blockIndex: 1, deposit: { sender: b64(sender), owner: b64(owner), assets: "1", shares: "1" } }] }] }, "1", contract, "Deposit"),
    /not an address|not valid bytes|Substreams output/,
  );
});
