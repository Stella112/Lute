# LUTE SELF-AUDIT — PHASE 1: RECONCILER

```
REAL TARGET
Network:            Base (chainId 8453)
Contract:           0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183  (Steakhouse USDC, MetaMorpho ERC-4626)
Subgraph:           https://api.morpho.org/graphql  (entity: vaultV1Transactions)
Block range:        51115000 -> 51125000   (Deposit demo; Withdraw demo uses 51100000 -> 51110000)
Safe head:          ~51,142,300 at run time; range end ~17.3k blocks (~9.6h) behind head

RAW SOURCE
Provider alias:     BASE_RPC_VERIFIER  (default https://mainnet.base.org, archive-capable)
Deposit count:      75   (range 51115000..51125000)
Withdraw count:     109  (range 51100000..51110000)

SUBGRAPH SOURCE
Entity/entities:    vaultV1Transactions
Deposit count:      75   (same range)  -> matches RAW
Withdraw count:     109  (same range)  -> matches RAW

HONEST CASE
Verdict:            VERIFIED
Checks passed:      event_count, event_presence, transaction_provenance, block_provenance,
                    duplicate_detection, field_accuracy:assets, field_accuracy:shares
Checks unverified:  field_accuracy:sender, field_accuracy:owner  (index does not expose them)
Checks failed:      none

BUGGED CASE
Bug introduced:     entity id = block number (instead of txHash+logIndex) in the local mapping
                    -> two same-block Deposits collide, the first is overwritten/dropped
Verifier changed between good and bugged runs?  NO
Raw count:          75
Indexed count:      74
Verdict:            FAILED
First divergent block:  51120808          (discovered by 14-step bisection, not hard-coded)
Transaction:        0x443364da3be710fc49773b87fdb5ed88805f2fe09c4fbe1dd7cd130217d82260
Log index:          496
Failed check:       event_presence

INDEPENDENCE
Does verifier execute Subgraph mapping logic?              NO
Does verifier contain hard-coded expected event counts?   NO
Could the planted mapping bug hide in both paths?         NO
                    (the bug lives only in LocalMappingSource entity-id logic; the verifier
                     derives expected values from eth_getLogs + ABI decode)

FAIL-CLOSED
RPC failure tested:        YES  (one chunk fails -> INCONCLUSIVE)
Subgraph failure tested:   YES  (page fails -> INCONCLUSIVE)
Partial data can produce VERIFIED?  NO

PROVENANCE
All runtime values carry source labels?  YES  (RAW_RPC / SUBGRAPH on every reported value)

SCOPE
Any later Lute phase implemented?  NO
                    (no dashboard, MCP, Hedera, Bazantic, x402, Graph Node, deployment, NL gen)

TESTS
Unit + negative:   19 passed (offline)
Integration:       2 passed (controlled bugged divergence + field-corruption)
Live:              1 passed (honest real-vault audit)
Failed/skipped:    0

FINAL RESULT:      GREEN
```

## Independence argument, per check

- **event_count / event_presence / duplicate_detection / transaction_provenance** — the
  expected set is the multiset of `(txHash, logIndex)` from `eth_getLogs`. A mapping bug
  cannot change what logs the chain emitted, so the verifier's expectation is unaffected.
- **field_accuracy (assets, shares)** — expected values are ABI-decoded from the raw log
  `data` word-by-word; the candidate's `assets`/`shares` are compared against them. A
  mapping that mis-assigns a field diverges from the raw decode.
- **block_provenance** — expected block is the log's own `blockNumber` from RPC.

In every case the expected value is reconstructed from raw chain data, never adopted
from the candidate. That is why the *same unchanged verifier* both VERIFIES the honest
index and FAILS the bugged one.
