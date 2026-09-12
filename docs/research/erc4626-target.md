# ERC-4626 Target Validation

> Real target, validated by execution against Base. All numbers emerged from real
> `eth_getLogs` / contract calls, not chosen to hit a preplanned figure.

| Field | Value |
|---|---|
| Chain | Base |
| Chain ID | 8453 |
| Vault | `0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183` (Steakhouse USDC, MetaMorpho) |
| Standard | ERC-4626 (OpenZeppelin ERC4626 base) — confirmed on-chain |
| Proxy note | MetaMorpho vault; events emitted directly by the vault address |
| ABI source | Event signatures confirmed from **actual emitted logs** + OZ ERC-4626 base |
| ERC-4626 evidence | `asset()` = `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` (Base USDC); `totalAssets()` returns; `decimals()` = 18 |
| Deposit signature | `Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)` |
| Deposit topic0 | `0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7` (= keccak256(sig), asserted equal to emitted topic) |
| Withdraw signature | `Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)` |
| Withdraw topic0 | `0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db` |
| Selected finalized range | `51,115,000 → 51,125,000` (~17k blocks / ~9.6h behind head at validation; reorg-safe) |
| Deposit count in range | **75** (real, from chunked `eth_getLogs`) |
| Withdraw count | **109** in `51,100,000 → 51,110,000` |
| Notable | Block **51,120,808** contains **two** Deposits in different txs (logIndex 496 & 523) — a real same-block collision used by the planted `id=block.number` mapping bug to drop exactly one → N vs N−1 |
| Graph query target | Real self-hosted graph-node subgraphs `lute/steak-honest` and `lute/steak-bugged` (deployed on VPS); Morpho public GraphQL index as a second independent source |
| RPC | `mainnet.base.org` (archive-capable); graph-node indexing RPC `base.drpc.org` (supports `eth_getBlockReceipts`) |
| Suitable for External Audit | Yes — both an external public index (Morpho) and a controllable Graph Node subgraph exist |
| Finality policy | Verify well-behind-head ranges; `minConfirmations` guard flips too-near-head ranges to INCONCLUSIVE |

## Limitations
- Morpho's public index exposes `assets`/`shares`/`txHash`/`logIndex` but **not** the address
  fields (sender/owner/receiver) → those checks report **UNVERIFIED** against Morpho (they
  are verifiable against the graph-node subgraph, which exposes them).
- `eth_getLogs` on `mainnet.base.org` is capped at a 2,000-block range → the reader chunks.
- Public RPCs rate-limit graph-node indexing; a dedicated archive RPC is recommended for sync.
