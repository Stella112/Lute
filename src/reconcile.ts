// Reconciliation checks. Compares the RAW_RPC canonical set against the SUBGRAPH
// indexed set. Every value carries source provenance. A check that cannot be
// performed (field not exposed by the index) is reported UNVERIFIED — never silently
// passed and never failed.

import { getEventDef } from "./abi.js";
import {
  eventIdentity,
  type CanonicalEvent,
  type CheckResult,
  type IndexedEvent,
} from "./types.js";

export type ReconcileInput = {
  eventName: string;
  raw: CanonicalEvent[];
  indexed: IndexedEvent[];
};

function indexByIdentity<T extends { transactionHash?: string; logIndex?: number }>(
  events: T[],
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const e of events) {
    const id = eventIdentity(e);
    const arr = m.get(id);
    if (arr) arr.push(e);
    else m.set(id, [e]);
  }
  return m;
}

export function runChecks(input: ReconcileInput): CheckResult[] {
  const { eventName, raw, indexed } = input;
  const def = getEventDef(eventName);
  const checks: CheckResult[] = [];

  const rawById = indexByIdentity(raw);
  const idxById = indexByIdentity(indexed);

  // 1) event_count
  checks.push({
    name: "event_count",
    class: "STRONG",
    status: raw.length === indexed.length ? "PASS" : "FAIL",
    expected: { value: String(raw.length), source: "RAW_RPC" },
    observed: { value: String(indexed.length), source: "SUBGRAPH" },
    detail: `raw=${raw.length} indexed=${indexed.length}`,
  });

  // 2) duplicate_detection (within the indexed set)
  const idxDuplicates = [...idxById.entries()].filter(([, arr]) => arr.length > 1);
  checks.push({
    name: "duplicate_detection",
    class: "STRONG",
    status: idxDuplicates.length === 0 ? "PASS" : "FAIL",
    expected: { value: "0", source: "RAW_RPC" },
    observed: { value: String(idxDuplicates.length), source: "SUBGRAPH" },
    detail:
      idxDuplicates.length === 0
        ? "no duplicate identities in index"
        : `duplicate identities: ${idxDuplicates.map(([id]) => id).slice(0, 5).join(", ")}`,
  });

  // 3) event_presence (bidirectional): every raw identity indexed, no phantom index entries
  const missingFromIndex = [...rawById.keys()].filter((id) => !idxById.has(id));
  const extraInIndex = [...idxById.keys()].filter((id) => !rawById.has(id));
  checks.push({
    name: "event_presence",
    class: "STRONG",
    status: missingFromIndex.length === 0 && extraInIndex.length === 0 ? "PASS" : "FAIL",
    expected: { value: String(rawById.size), source: "RAW_RPC" },
    observed: { value: String(idxById.size), source: "SUBGRAPH" },
    detail: `missing_from_index=${missingFromIndex.length} extra_in_index=${extraInIndex.length}`,
  });

  // 4) transaction_provenance: every indexed identity corresponds to a real raw log
  checks.push({
    name: "transaction_provenance",
    class: "STRONG",
    status: extraInIndex.length === 0 ? "PASS" : "FAIL",
    expected: { value: "0", source: "RAW_RPC" },
    observed: { value: String(extraInIndex.length), source: "SUBGRAPH" },
    detail:
      extraInIndex.length === 0
        ? "every indexed record maps to a real on-chain log"
        : `phantom indexed identities: ${extraInIndex.slice(0, 5).join(", ")}`,
  });

  // matched identities (present on both sides, exactly once each)
  const matched: { id: string; raw: CanonicalEvent; idx: IndexedEvent }[] = [];
  for (const [id, arr] of rawById) {
    const idxArr = idxById.get(id);
    if (arr.length === 1 && idxArr && idxArr.length === 1) {
      matched.push({ id, raw: arr[0]!, idx: idxArr[0]! });
    }
  }

  // 5) block_provenance: matched identities agree on block number
  {
    const withBlock = matched.filter((m) => m.idx.blockNumber !== undefined);
    if (withBlock.length === 0) {
      checks.push({
        name: "block_provenance",
        class: "STRONG",
        status: "UNVERIFIED",
        detail: "index does not expose blockNumber",
      });
    } else {
      const bad = withBlock.filter((m) => m.idx.blockNumber !== m.raw.blockNumber);
      checks.push({
        name: "block_provenance",
        class: "STRONG",
        status: bad.length === 0 ? "PASS" : "FAIL",
        expected: { value: "matched blockNumbers equal", source: "RAW_RPC" },
        observed: { value: `${bad.length} mismatched of ${withBlock.length}`, source: "SUBGRAPH" },
        detail: bad.length === 0 ? `${withBlock.length} matched blocks agree` : undefined,
      });
    }
  }

  // 6) field_accuracy: one check per event field, over matched identities
  for (const p of def.params) {
    const exposedCount = matched.filter((m) => m.idx.fields[p.name] !== undefined).length;
    if (exposedCount === 0) {
      checks.push({
        name: `field_accuracy:${p.name}`,
        class: "STRONG",
        status: "UNVERIFIED",
        detail: `index does not expose "${p.name}"`,
      });
      continue;
    }
    const comparable = matched.filter((m) => m.idx.fields[p.name] !== undefined);
    const mismatches = comparable.filter((m) => m.idx.fields[p.name] !== m.raw.fields[p.name]);
    checks.push({
      name: `field_accuracy:${p.name}`,
      class: "STRONG",
      status: mismatches.length === 0 ? "PASS" : "FAIL",
      expected: { value: `${comparable.length} values match`, source: "RAW_RPC" },
      observed: { value: `${mismatches.length} mismatched`, source: "SUBGRAPH" },
      detail:
        mismatches.length > 0 && mismatches[0]
          ? `first mismatch id=${mismatches[0].id} raw=${mismatches[0].raw.fields[p.name]} indexed=${mismatches[0].idx.fields[p.name]}`
          : undefined,
    });
  }

  return checks;
}
