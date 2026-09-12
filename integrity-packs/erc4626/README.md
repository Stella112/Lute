# ERC-4626 Integrity Pack

`erc4626@1` is Lute's first executable integrity-pack contract. It defines the
observable Deposit and Withdraw claims that Lute can independently reconcile from
raw EVM logs against an indexed candidate.

The pack deliberately does not claim to verify APY, strategy accounting, or
arbitrary vault business logic. A check is VERIFIED only when the required raw and
indexed sources are complete and the unchanged verifier can compare them.
