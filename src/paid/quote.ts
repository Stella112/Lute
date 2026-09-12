// Deterministic verification quote (contract §49). Payment scales with the actual
// verification work (block-range span), not an irrational fee schedule. Amounts are in
// HBAR tinybars (1 HBAR = 100,000,000 tinybar), the smallest unit, matching the x402
// Hedera `amount` field with asset "0.0.0".

export type AuditTier = "quick" | "standard" | "deep";

export type Quote = { tier: AuditTier; hbar: number; tinybars: string; blocks: number };

const TINYBAR_PER_HBAR = 100_000_000;

export function quote(fromBlock: bigint, toBlock: bigint): Quote {
  if (fromBlock < 0n || toBlock < fromBlock) throw new Error("invalid block range");
  const span = toBlock - fromBlock + 1n;
  if (span > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("block range is too large to quote");
  const blocks = Number(span);
  const tier: AuditTier = blocks <= 2000 ? "quick" : blocks <= 20000 ? "standard" : "deep";
  const hbar = tier === "quick" ? 0.5 : tier === "standard" ? 1 : 2; // testnet demo pricing
  const tinybars = BigInt(Math.round(hbar * TINYBAR_PER_HBAR)).toString();
  return { tier, hbar, tinybars, blocks };
}
