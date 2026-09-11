// First-divergence engine.
//
// When the two paths disagree, this locates the EARLIEST concrete mismatch by
// bisecting the block range and RE-EXECUTING both independent paths on each
// sub-range. Nothing about the planted bug (its block, tx, count) is known ahead of
// time — every value is discovered during this search.
//
// Correctness of the bisection: a sub-range "diverges" iff it contains at least one
// per-identity disagreement (missing / extra / duplicate / field / block). Because
// identities are block-scoped, divergence is additive over a split:
//   diverges(from,to) == diverges(from,mid) || diverges(mid+1,to)
// so descending into the left half whenever it diverges, and otherwise into the
// right half, converges on the block of the first divergence.

import { byBlockThenLog } from "./canonical.js";
import { runChecks } from "./reconcile.js";
import { eventIdentity, type CanonicalEvent, type FirstDivergence, type IndexedEvent } from "./types.js";

export type RangeFetchers = {
  fetchRaw: (from: bigint, to: bigint) => Promise<CanonicalEvent[]>;
  fetchIndexed: (from: bigint, to: bigint) => Promise<IndexedEvent[]>;
};

async function diverges(
  f: RangeFetchers,
  eventName: string,
  from: bigint,
  to: bigint,
): Promise<boolean> {
  const [raw, indexed] = await Promise.all([f.fetchRaw(from, to), f.fetchIndexed(from, to)]);
  return runChecks({ eventName, raw, indexed }).some((c) => c.status === "FAIL");
}

/** Ordered scan within a (small) window to pin the exact first divergent event. */
function pinpoint(
  raw: CanonicalEvent[],
  indexed: IndexedEvent[],
  eventName: string,
): FirstDivergence {
  const idxById = new Map<string, IndexedEvent[]>();
  for (const e of indexed) {
    const id = eventIdentity(e);
    (idxById.get(id) ?? idxById.set(id, []).get(id)!).push(e);
  }
  const rawSorted = [...raw].sort(byBlockThenLog);

  for (const r of rawSorted) {
    const id = eventIdentity(r);
    const matches = idxById.get(id);
    if (!matches || matches.length === 0) {
      return divergence(r, "event_presence", r, null);
    }
    if (matches.length > 1) {
      return divergence(r, "duplicate_detection", r, matches[0]!);
    }
    const idx = matches[0]!;
    if (idx.blockNumber !== undefined && idx.blockNumber !== r.blockNumber) {
      return divergence(r, "block_provenance", r, idx);
    }
    for (const [k, v] of Object.entries(r.fields)) {
      if (idx.fields[k] !== undefined && idx.fields[k] !== v) {
        return divergence(r, `field_accuracy:${k}`, r, idx);
      }
    }
  }

  // No raw-anchored divergence: look for a phantom (extra) indexed entry.
  const rawIds = new Set(rawSorted.map(eventIdentity));
  const phantom = [...indexed]
    .filter((e) => !rawIds.has(eventIdentity(e)))
    .sort(byBlockThenLog)[0];
  if (phantom) {
    return {
      blockNumber: phantom.blockNumber ?? "0",
      transactionHash: phantom.transactionHash ?? "0x",
      logIndex: phantom.logIndex ?? 0,
      event: eventName,
      check: "transaction_provenance",
      expectedSource: "RAW_RPC",
      observedSource: "SUBGRAPH",
      raw: null,
      indexed: phantom.fields,
    };
  }
  return null;
}

function divergence(
  anchor: CanonicalEvent,
  check: string,
  raw: CanonicalEvent,
  idx: IndexedEvent | null,
): FirstDivergence {
  return {
    blockNumber: anchor.blockNumber,
    transactionHash: anchor.transactionHash,
    logIndex: anchor.logIndex,
    event: anchor.eventName,
    check,
    expectedSource: "RAW_RPC",
    observedSource: "SUBGRAPH",
    raw: raw.fields,
    indexed: idx ? idx.fields : null,
  };
}

export type DivergenceSearch = {
  divergence: FirstDivergence;
  windowFrom: string;
  windowTo: string;
  steps: number;
};

/** Bisect [from,to] to the block of the first divergence, then pinpoint within it. */
export async function findFirstDivergence(
  f: RangeFetchers,
  eventName: string,
  from: bigint,
  to: bigint,
): Promise<DivergenceSearch | null> {
  if (!(await diverges(f, eventName, from, to))) return null;

  let lo = from;
  let hi = to;
  let steps = 0;
  while (lo < hi) {
    steps++;
    const mid = lo + (hi - lo) / 2n;
    if (await diverges(f, eventName, lo, mid)) {
      hi = mid; // first divergence is within [lo, mid]
    } else {
      lo = mid + 1n; // clean left half -> it must be in (mid, hi]
    }
  }
  // lo == hi == the block of the first divergence
  const [raw, indexed] = await Promise.all([f.fetchRaw(lo, hi), f.fetchIndexed(lo, hi)]);
  return {
    divergence: pinpoint(raw, indexed, eventName),
    windowFrom: lo.toString(),
    windowTo: hi.toString(),
    steps,
  };
}
