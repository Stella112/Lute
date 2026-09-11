// HONEST mapping.
//
// Each ERC-4626 Deposit/Withdraw becomes one entity keyed by the canonical identity
// transactionHash-logIndex. This is what a correct subgraph produces; Lute should
// reconcile it against raw RPC with no divergence.

import { Deposit, Withdraw } from "../generated/SteakUSDC/ERC4626";
import { DepositEvent, WithdrawEvent } from "../generated/schema";

export function handleDeposit(event: Deposit): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let e = new DepositEvent(id);
  e.blockNumber = event.block.number;
  e.blockHash = event.block.hash;
  e.transactionHash = event.transaction.hash;
  e.transactionIndex = event.transaction.index.toI32();
  e.logIndex = event.logIndex.toI32();
  e.sender = event.params.sender;
  e.owner = event.params.owner;
  e.assets = event.params.assets;
  e.shares = event.params.shares;
  e.save();
}

export function handleWithdraw(event: Withdraw): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let e = new WithdrawEvent(id);
  e.blockNumber = event.block.number;
  e.blockHash = event.block.hash;
  e.transactionHash = event.transaction.hash;
  e.transactionIndex = event.transaction.index.toI32();
  e.logIndex = event.logIndex.toI32();
  e.sender = event.params.sender;
  e.receiver = event.params.receiver;
  e.owner = event.params.owner;
  e.assets = event.params.assets;
  e.shares = event.params.shares;
  e.save();
}
