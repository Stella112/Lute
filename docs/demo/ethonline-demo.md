# ETHOnline demo script

## Primary story (2–4 minutes)

1. Start on the Lute landing page: **Build. Verify. Deploy.**
2. Run the honest Base ERC-4626 audit against the real Morpho/Graph Node source.
   Show the raw event count, indexed count, explicit checks, and `VERIFIED` verdict.
3. Run the same audit against the controlled bugged mapping. Show the missing event,
   first divergent block/transaction/log, and the blocked deployment gate.
4. Change the candidate mapping, recompute its candidate hash, and rerun the unchanged
   verifier. Show that a changed artifact cannot reuse the previous verification.
5. If a real Studio deployment is available, deploy only the verified candidate and run
   the smoke query. If it is not available, say so explicitly; do not substitute the
   self-hosted Graph Node result for Studio evidence.

## Sponsor extensions (only after the core story)

### Hedera

Run the paid service and the consumer agent with a funded Hedera testnet payer. Show the
402 challenge, Blocky402 verification/settlement, settlement transaction, and the actual
Lute report returned after payment. Record the transaction in `docs/judging/evidence.md`.

### Bazantic

Use the live gateway and Recipe only after the upstream is public over HTTPS. Show a
Graph discovery/query result flowing into Lute's audit, then show the Recipe stopping on
`FAILED` and continuing on `VERIFIED`. Record the gateway URL, Recipe, and account name
in `docs/judging/evidence.md`.

## Claims discipline

Only show live values from the current run as qualifying evidence. Fixtures in the web
dashboard are product-vision data and must not be described as live verification runs.
