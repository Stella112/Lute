// Canonical address normalization.
//
// We normalize to lowercase 0x-prefixed 20-byte hex. (EIP-55 checksum casing is a
// display concern; for identity/comparison we lowercase.) A 32-byte topic word that
// encodes an address is right-aligned: take the last 40 hex chars.

const ADDR_RE = /^0x[0-9a-f]{40}$/;

/** Lowercase and validate a 20-byte address. Throws on malformed input. */
export function normalizeAddress(addr: string): string {
  const lower = addr.toLowerCase();
  if (!ADDR_RE.test(lower)) {
    throw new Error(`not a valid 20-byte address: ${addr}`);
  }
  return lower;
}

/** Extract an address from a 32-byte topic word (left-padded with zeros). */
export function addressFromTopic(topic: string): string {
  const clean = topic.startsWith("0x") ? topic.slice(2) : topic;
  if (clean.length !== 64) {
    throw new Error(`topic word must be 32 bytes, got ${clean.length / 2}`);
  }
  return normalizeAddress("0x" + clean.slice(24));
}

/** Case-insensitive address equality. */
export function addressEquals(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
