// BUGGED mapping — a realistic, LOCAL mapping bug planted in the entity id.
//
// The ONLY difference from mapping.ts is the id: it uses the block number instead of
// transactionHash-logIndex. Block number is not unique per event, so two events in the
// same block collide and the second save overwrites the first (last-write-wins) — the
// first event is silently lost from the index.
//
// This is a genuine class of subgraph mapping mistake. The unchanged Lute verifier
// (which derives its expected set independently from raw RPC logs) must catch it.

import { Deposit, Withdraw } from "../generated/SteakUSDC/ERC4626";
import { DepositEvent, WithdrawEvent } from "../generated/schema";

export function handleDeposit(event: Deposit): void {
  // BUG: block number is not a unique per-event id.
  let id = event.block.number.toString();
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
  // BUG: same non-unique id on the withdraw handler.
  let id = event.block.number.toString();
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
