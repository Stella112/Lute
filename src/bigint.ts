// Bigint-safe helpers. uint256 values must never pass through JS `Number`.

/** Parse a hex quantity (0x...) into a bigint. */
export function hexToBigInt(hex: string): bigint {
  return BigInt(hex);
}

/** Parse a hex quantity into a JS number, asserting it is safe (only for small ints: indexes). */
export function hexToSafeNumber(hex: string): number {
  const b = BigInt(hex);
  if (b > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`value ${b} exceeds MAX_SAFE_INTEGER; use hexToBigInt`);
  }
  return Number(b);
}

/** Decode a 32-byte (64 hex char) word as an unsigned integer, returned as a decimal string. */
export function wordToUintDecimal(word: string): string {
  const clean = word.startsWith("0x") ? word.slice(2) : word;
  return BigInt("0x" + clean).toString(10);
}

/** JSON replacer that serializes bigint as a decimal string. */
export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString(10) : value;
}

/** Stringify with bigint support and stable indentation. */
export function toJSON(value: unknown, indent = 2): string {
  return JSON.stringify(value, bigintReplacer, indent);
}
