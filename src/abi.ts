// Independent ABI / event decoder — the VERIFIER's ground-truth decoder.
//
// This module knows the canonical ERC-4626 event signatures and derives topic0 by
// keccak256 of the signature string (it does NOT trust a hard-coded topic, and does
// NOT reuse any Subgraph mapping). Decoding a raw RPC log here is how Lute obtains
// its INDEPENDENT expected values.
//
// ERC-4626 (EIP-4626) canonical events:
//   Deposit (address indexed sender, address indexed owner,
//            uint256 assets, uint256 shares)
//   Withdraw(address indexed sender, address indexed receiver, address indexed owner,
//            uint256 assets, uint256 shares)

import jsSha3 from "js-sha3";
import { addressFromTopic } from "./address.js";

const { keccak_256 } = jsSha3;
import { wordToUintDecimal } from "./bigint.js";

export type ParamKind = "address" | "uint256";

export type EventParam = {
  name: string;
  kind: ParamKind;
  indexed: boolean;
};

export type EventDef = {
  name: string;
  params: EventParam[];
  signature: string; // canonical signature used for topic0
  topic0: string; // 0x-prefixed keccak256(signature)
};

/** keccak256 of a UTF-8 string, 0x-prefixed. */
export function keccak256Utf8(s: string): string {
  return "0x" + keccak_256(s);
}

function buildEvent(name: string, params: EventParam[]): EventDef {
  const signature = `${name}(${params.map((p) => p.kind).join(",")})`;
  return { name, params, signature, topic0: keccak256Utf8(signature) };
}

export const ERC4626_EVENTS: Record<string, EventDef> = {
  Deposit: buildEvent("Deposit", [
    { name: "sender", kind: "address", indexed: true },
    { name: "owner", kind: "address", indexed: true },
    { name: "assets", kind: "uint256", indexed: false },
    { name: "shares", kind: "uint256", indexed: false },
  ]),
  Withdraw: buildEvent("Withdraw", [
    { name: "sender", kind: "address", indexed: true },
    { name: "receiver", kind: "address", indexed: true },
    { name: "owner", kind: "address", indexed: true },
    { name: "assets", kind: "uint256", indexed: false },
    { name: "shares", kind: "uint256", indexed: false },
  ]),
};

export function getEventDef(name: string): EventDef {
  const def = ERC4626_EVENTS[name];
  if (!def) {
    throw new Error(
      `unsupported event "${name}"; supported: ${Object.keys(ERC4626_EVENTS).join(", ")}`,
    );
  }
  return def;
}

export type RawLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  transactionIndex: string;
  logIndex: string;
};

/**
 * Decode a raw log against an event definition into named string fields.
 * Throws if the log's topic0 does not match the derived signature topic, if the
 * indexed-topic count is wrong, or if the data payload is the wrong length.
 */
export function decodeLog(def: EventDef, log: RawLog): Record<string, string> {
  if (!log.topics[0] || log.topics[0].toLowerCase() !== def.topic0.toLowerCase()) {
    throw new Error(
      `topic0 mismatch for ${def.name}: expected ${def.topic0}, got ${log.topics[0]}`,
    );
  }
  const indexed = def.params.filter((p) => p.indexed);
  const nonIndexed = def.params.filter((p) => !p.indexed);

  // topics[0] is the signature; topics[1..] are the indexed params.
  if (log.topics.length !== indexed.length + 1) {
    throw new Error(
      `${def.name}: expected ${indexed.length} indexed topics, got ${log.topics.length - 1}`,
    );
  }
  const dataHex = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  if (dataHex.length !== nonIndexed.length * 64) {
    throw new Error(
      `${def.name}: expected ${nonIndexed.length} data words, got ${dataHex.length / 64}`,
    );
  }

  const fields: Record<string, string> = {};
  indexed.forEach((p, i) => {
    const topic = log.topics[i + 1]!;
    fields[p.name] = p.kind === "address" ? addressFromTopic(topic) : wordToUintDecimal(topic);
  });
  nonIndexed.forEach((p, i) => {
    const word = dataHex.slice(i * 64, i * 64 + 64);
    fields[p.name] = wordToUintDecimal(word);
  });
  return fields;
}
