# Lute — Phase 1: Reconciler

Independent verification of a Subgraph-class index against raw blockchain data.

Lute reconstructs event facts **directly from Base RPC logs** and compares them to the
**same events as reported by an independent index**. If the index's mapping is wrong,
Lute catches it — because Lute's expected values never come from the mapping.

This phase proves exactly one thing, on real data:

```
HONEST:  RAW_RPC = 75   SUBGRAPH = 75   -> VERIFIED
BUGGED:  RAW_RPC = 75   SUBGRAPH = 74   -> FAILED
         first divergence: block 51120808
                           tx    0x443364da3be710fc49773b87fdb5ed88805f2fe09c4fbe1dd7cd130217d82260
                           log   496
```

Every number is discovered at runtime. None is hard-coded in the verifier.

---

## The two paths (physically separate)

| | RAW_RPC (verifier / ground truth) | SUBGRAPH (candidate under audit) |
|---|---|---|
| code | `src/rpc.ts`, `src/abi.ts`, `src/canonical.ts` | `src/subgraph/morpho.ts` (real) · `src/subgraph/localMapping.ts` (controlled) |
| how facts are derived | `eth_getLogs` → ABI-decode the raw log | queried from an index built by someone else's mapping |
| topic0 | `keccak256("Deposit(address,address,uint256,uint256)")`, asserted to equal the emitted topic | n/a |

The verifier **never** imports the candidate's mapping, and never adopts a value it
observed from the candidate. Before each check we ask: *if the mapping had a bug in
this computation, would the verifier still independently obtain the correct expected
value?* If not, it is not a valid check.

---

## Run it

```bash
npm install

# HONEST — audit the real Morpho index against raw Base RPC
npm run lute -- audit --network base \
  --contract 0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183 \
  --subgraph morpho --event Deposit \
  --from-block 51115000 --to-block 51125000

# BUGGED — same verifier, unchanged, against a mapping with a planted entity-id bug
npm run lute -- audit --network base \
  --contract 0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183 \
  --subgraph local:block-id --event Deposit \
  --from-block 51115000 --to-block 51125000
```

Add `--json` for machine-readable output. Exit codes: `0` VERIFIED, `2` FAILED,
`3` INCONCLUSIVE. The verifier RPC URL is read from `BASE_RPC_VERIFIER` (only the
alias is ever logged); it defaults to the public archive endpoint `mainnet.base.org`.

```bash
npm test          # 19 unit + negative tests (offline)
npm run test:live # honest real-vault audit (network)
npm run test:bugged # controlled bugged divergence (network)
```

---

## Phase 2 — MCP server

The verified reconciler is exposed as agent-callable tools over stdio ([`src/mcp.ts`](src/mcp.ts)),
reusing the Phase 1 engine unchanged.

- `lute_audit(network, contract, event, fromBlock, toBlock, subgraph)` → the machine-readable
  `AuditReport` (verdict + checks + evidence + `firstDivergence`).
- `lute_supported_events()` → the ERC-4626 events with signature and `keccak256`-derived `topic0` (offline).

Run standalone: `npm run mcp`. Register it in an MCP client with
[`mcp.config.example.json`](mcp.config.example.json) (Claude Code: add the `mcpServers`
entry to `.mcp.json`, using an absolute path to `src/mcp.ts`). MCP speaks JSON-RPC on
stdout; all Lute logging goes to stderr, so the protocol stream is never corrupted.

```bash
npm run test:mcp  # spawns the server and drives it as a real MCP client (network)
```

Verified end-to-end over MCP: `lute_audit` returns VERIFIED (75==75) for the real Morpho
index and FAILED (75 vs 74, first divergence block 51120808) for the bugged mapping —
the same results as the CLI, through the protocol.

---

## Phase 3 — Operating a watchlist

`lute watch` audits a list of targets, isolates per-target failures, and rolls up to a
single status a scheduler / CI job can act on ([`src/runner.ts`](src/runner.ts)).

```bash
npm run lute -- watch --config lute.targets.example.json   # add --json for machine output
```

Exit codes: `0` all VERIFIED · `2` any FAILED · `3` any INCONCLUSIVE (no FAILED). Every
non-VERIFIED target emits a structured `alert.target` line on stderr (target, contract,
status, first-divergence block) for a monitor to pick up. Schedule it with OS cron or
the Claude Code `/schedule` routine — the runner is the unit of work; scheduling just
invokes it.

Live proof over the example watchlist (real Base data):

```
  steak-usdc-deposits                 VERIFIED  raw=75  sub=75
  steak-usdc-withdraws                VERIFIED  raw=109 sub=109
  steak-usdc-deposits-BUGGED-mapping  FAILED    first divergence @ block 51120808
Summary: 2 VERIFIED, 1 FAILED, 0 INCONCLUSIVE (of 3)  ->  BATCH VERDICT: FAILED (exit 2)
```

---

## Phase 4 — Dashboard

A tiny local server ([`src/server.ts`](src/server.ts)) runs the **real** audit engine and
serves a single-page UI ([`public/index.html`](public/index.html)) — the browser only ever
talks to this local server (same-origin, no CORS); all RPC/Subgraph traffic is server-side.

```bash
npm run dashboard   # http://localhost:8788  (PORT env to override)
```

Pick a vault, event, block range and index (`morpho`, or a `local:<bug>` mapping), hit
**Run audit**, and see the verdict badge, RAW vs SUBGRAPH counts, the checks table, the
first-divergence panel, and full provenance. Endpoints: `POST /api/audit` (returns the
`AuditReport` JSON) and `GET /api/events`. No reimplementation — the UI is a thin view
over the same engine the CLI and MCP server use. Verified live in-browser: `morpho` →
VERIFIED (75/75), `local:block-id` → FAILED (75/74, first divergence block 51120808).

---

## Phase 5 — Natural-language explanations

A **deterministic** generator ([`src/explain.ts`](src/explain.ts)) turns an `AuditReport`
into plain English — a pure function of the report's fields, no model call and no
fabrication, so the prose is exactly as trustworthy as the report.

```bash
npm run lute -- audit --contract 0x... --event Deposit --from-block N --to-block N --explain
npm run lute -- explain --file evidence_bugged.json      # explain a saved report
```

Also exposed as the MCP tool `lute_explain(report)` and folded into the watch runner's
`alert.target` line as a one-line `summary`. Example, from the real bugged run:

> Audit … — FAILED. Over Base blocks 51115000–51125000, the raw chain has 75 Deposit
> event(s) but local-mapping://block-id reported 74. The following check(s) failed:
> event_count and event_presence. … The earliest divergence is at block 51120808,
> transaction 0x443364…82260, log index 496. That Deposit event is present on-chain but
> missing from the index (failed check: event_presence). This exact block, transaction
> and log were discovered by range bisection during the run — none was known in advance.

---

## VAULT VALIDATION

```
network:            Base (chainId 8453)
contract:           0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183  (Steakhouse USDC / "steakUSDC")
contract standard:  ERC-4626 (MetaMorpho, OZ ERC4626 base)
                    confirmed on-chain: asset()=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 (Base USDC),
                    totalAssets()=132619496922066, decimals()=18
ABI source:         event signatures confirmed from actual emitted logs (topic0 == keccak256(signature))

Deposit signature:  Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)
Deposit topic0:     0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7

Withdraw signature: Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)
Withdraw topic0:    0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db

Subgraph:           https://api.morpho.org/graphql   (Morpho public GraphQL indexer)
                    An independent, externally-operated index Lute does not control and
                    shares no mapping code with. Used as the honest audit's candidate.
Entity used:        vaultV1Transactions
Fields available:   txHash, blockNumber, txIndex, logIndex, type (Deposit/Withdraw), assets, shares
                    (sender/owner/receiver are NOT exposed -> those field checks report UNVERIFIED)

Candidate range:    51115000 -> 51125000   (Deposit demo)
Events in range:    Deposit  = 75   (RAW_RPC == Morpho)
                    Withdraw = 109 over [51100000, 51110000] (RAW_RPC == Morpho), used for the Withdraw demo
Safe head basis:    chain head ~51,142,300 at run time; range end is ~17.3k blocks
                    (~9.6h at 2s/block) behind head -> final, reorg-safe
eth_getLogs limit:  provider caps ranges at 2000 blocks; the reader chunks accordingly

TARGET STATUS:      VALID
```

### Why this yields a clean N vs N−1

Within `[51115000, 51125000]` exactly one block (**51120808**) contains two Deposit
events, in two different transactions (logIndex 496 and 523). Both are real; both are
in the raw logs and in Morpho's index. The controlled bug is a classic mapping mistake:

> `LocalMappingSource` with `bug="block-id"` uses `event.block.number` as the entity id
> instead of `txHash + logIndex`.

Two events in one block collide; `store.set` keeps the last write (logIndex 523) and
silently drops the first (logIndex 496). Indexed count becomes 74. The verifier — a
general rule that every raw `(txHash, logIndex)` must be indexed exactly once — flags
the missing event and the bisection engine locates block 51120808 with no prior
knowledge of it.

---

## Checks implemented

`event_count`, `event_presence` (bidirectional: missing + phantom), `transaction_provenance`,
`block_provenance`, `duplicate_detection`, and per-field `field_accuracy` (`assets`,
`shares` verified against RAW; `sender`/`owner`/`receiver` reported UNVERIFIED because
Morpho does not expose them). A field the index does not expose is never silently
passed or failed.

`VERIFIED` requires count + presence to PASS, no STRONG check to FAIL, **and** at least
one field to have been independently verified — so an index that exposes nothing can
never be VERIFIED. Any infrastructure failure (an unretrievable RPC chunk, a failed
Subgraph page, malformed data) is **INCONCLUSIVE**, never VERIFIED.

**Reorg safety.** A range past chain head is INCONCLUSIVE; with `--min-confirmations N`
(CLI) or `minConfirmations` (engine/MCP), a range end nearer than `N` blocks to head is
also INCONCLUSIVE rather than audited on reorg-prone data.

**Not overfit to one vault.** The same engine was validated on a second, unrelated Base
MetaMorpho vault — Gauntlet USDC Prime (`0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61`):
honest `morpho` → VERIFIED (71 == 71); a `swap-fields` mapping bug → FAILED, caught by
`field_accuracy:assets` at block 51120116 (raw `assets=400000000` vs the index's swapped
`shares` value). Different vault, different bug class, different failing check — same
unchanged verifier.

---

## Evidence files

- [`evidence_honest.json`](evidence_honest.json) — full machine-readable VERIFIED verdict
- [`evidence_bugged.json`](evidence_bugged.json) — full machine-readable FAILED verdict with `firstDivergence`
- [`SELF_AUDIT.md`](SELF_AUDIT.md) — the mandatory Phase 1 self-audit, filled with real results

## Scope

Phase 1 only: existing indexed Subgraph + independent raw RPC. No dashboard, MCP,
Hedera, Bazantic, x402, Graph Node, deployment, or NL generation was built.
