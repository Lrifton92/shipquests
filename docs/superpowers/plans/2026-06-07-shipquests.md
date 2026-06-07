# ShipQuests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Celo/MiniPay quest-to-earn MiniApp (ShipQuests) where sponsors fund quests, users complete an onchain action, the backend verifies it onchain + signs an EIP-712 attestation, and users claim a reward (fixed one-shot OR variable daily-box) from an onchain escrow — live on Celo mainnet before 22 June.

**Architecture:** One `QuestEscrow.sol` contract (forked from Soufian's DropRankBadge EIP-712 pattern) holds sponsor funds and pays on a trusted-signer attestation. A Next.js backend reads Celo RPC/Blockscout to confirm completion and signs the attestation. A Next.js MiniApp (MiniPay-compatible) lists quests and runs the claim flow. Reward amount is carried in the signed attestation and bounded onchain — no VRF, no onchain randomness.

**Tech Stack:** Solidity 0.8.24 (Hardhat 3, forge-std tests), viem, Next.js (App Router), Celo mainnet (cUSD), MiniPay (`window.ethereum`).

**Reference:** Reuse `Desktop/Programme Créer/DropRank/contracts/src/DropRankBadge.sol` as the EIP-712 + trusted-signer template. Same keystore/deploy conventions as DropRank (`docs/superpowers/specs/2026-06-07-shipquests-design.md` §4-5).

---

## File Structure

```
ShipQuests/
  contracts/
    src/QuestEscrow.sol            # the escrow + EIP-712 claim
    test/QuestEscrow.t.sol         # Solidity tests (forge-std)
    script/deploy.ts               # viem deploy to Celo
    hardhat.config.ts              # solc 0.8.24, celo + alfajores networks
    .env.example
  lib/
    quest-abi.ts                   # typed ABI + EIP-712 helpers (frontend/backend)
    celo-read.ts                   # onchain completion verification (RPC/Blockscout)
    attest.ts                      # EIP-712 attestation signer (server-only)
  app/
    page.tsx                       # quest list
    quest/[id]/page.tsx            # quest detail + claim flow
    sponsor/page.tsx               # create-quest form (fast-follow)
    api/attest/[questId]/route.ts  # verify + sign attestation
    _components/useMiniPay.ts      # MiniPay connection hook
  scripts/seed-quest.mjs           # seed first quest manually (J8)
```

---

## Phase 0 — Scaffold (J1)

### Task 1: Scaffold MiniApp + contracts workspace

**Files:**
- Create: `package.json`, `app/page.tsx`, `contracts/package.json`, `contracts/hardhat.config.ts`, `.gitignore`

- [ ] **Step 1: Scaffold the Next.js app**

Run: `npx create-next-app@latest . --ts --app --no-tailwind --no-src-dir --use-npm --eslint`
(accept defaults; if dir non-empty, scaffold in a temp dir and copy in)

- [ ] **Step 2: Add the contracts workspace (copy DropRank's Hardhat setup)**

```bash
mkdir -p contracts/src contracts/test contracts/script
cp "../DropRank/contracts/hardhat.config.ts" contracts/hardhat.config.ts
cp "../DropRank/contracts/package.json" contracts/package.json
cd contracts && npm install && cd ..
```

- [ ] **Step 3: Configure Celo networks in `contracts/hardhat.config.ts`**

Edit the `networks` block to add Celo mainnet + Alfajores testnet:

```ts
networks: {
  celo: { url: process.env.CELO_RPC_URL || "https://forno.celo.org", accounts: [] },
  alfajores: { url: process.env.ALFAJORES_RPC_URL || "https://alfajores-forno.celo-testnet.org", accounts: [] },
},
```
(keystore-based signing as in DropRank; never inline keys)

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold ShipQuests (next.js app + hardhat contracts workspace)"
```

---

## Phase 1 — QuestEscrow contract (J1-2)

### Task 2: EIP-712 domain + quest storage + createQuest

**Files:**
- Create: `contracts/src/QuestEscrow.sol`
- Test: `contracts/test/QuestEscrow.t.sol`

- [ ] **Step 1: Write the failing test for createQuest**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {QuestEscrow} from "../src/QuestEscrow.sol";
import {MockERC20} from "./MockERC20.sol"; // minimal ERC20 with mint()

contract QuestEscrowTest is Test {
    QuestEscrow esc;
    MockERC20 cusd;
    address signer = vm.addr(0xA11CE);
    address sponsor = address(0xBEEF);
    address user = vm.addr(0xU5E5);
    address target = address(0xDEAD); // sponsor's app contract

    function setUp() public {
        cusd = new MockERC20();
        esc = new QuestEscrow(signer);
        cusd.mint(sponsor, 1000e18);
        vm.prank(sponsor); cusd.approve(address(esc), type(uint256).max);
    }

    function test_createQuest_escrowsMaxPayout() public {
        vm.prank(sponsor);
        uint256 id = esc.createQuest(target, address(cusd), 1e18, 5e18, 10, QuestEscrow.Kind.Daily, block.timestamp + 30 days);
        // escrow holds maxReward * maxCompletions = 5e18 * 10
        assertEq(cusd.balanceOf(address(esc)), 50e18);
        ( , , , uint256 minR, uint256 maxR, uint256 left, , ) = esc.quests(id);
        assertEq(minR, 1e18); assertEq(maxR, 5e18); assertEq(left, 10);
    }
}
```

- [ ] **Step 2: Run test, verify it fails (no contract)**

Run: `cd contracts && npx hardhat test --grep test_createQuest_escrowsMaxPayout`
Expected: FAIL (compile error / QuestEscrow not found). Also create `contracts/test/MockERC20.sol` (minimal: `mint`, `transfer`, `transferFrom`, `approve`, `balanceOf`).

- [ ] **Step 3: Implement QuestEscrow skeleton + createQuest**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 { function transfer(address,uint256) external returns(bool); function transferFrom(address,address,uint256) external returns(bool); }

contract QuestEscrow {
    enum Kind { OneShot, Daily }
    struct Quest {
        address sponsor;
        address target;       // sponsor app contract the user must interact with
        address token;        // cUSD
        uint256 minReward;
        uint256 maxReward;
        uint256 left;         // completions remaining
        uint64  deadline;
        Kind    kind;
    }
    address public immutable signer;          // trusted backend attestor
    uint256 public nextId = 1;
    mapping(uint256 => Quest) public quests;
    mapping(uint256 => mapping(address => uint256)) public lastClaim; // questId => wallet => ts (0 = never)

    constructor(address _signer) { signer = _signer; }

    function createQuest(address target, address token, uint256 minReward, uint256 maxReward, uint256 maxCompletions, Kind kind, uint64 deadline)
        external returns (uint256 id)
    {
        require(maxReward >= minReward && maxReward > 0, "bad reward");
        require(maxCompletions > 0, "bad count");
        require(deadline > block.timestamp, "bad deadline");
        id = nextId++;
        quests[id] = Quest(msg.sender, target, token, minReward, maxReward, maxCompletions, deadline, kind);
        require(IERC20(token).transferFrom(msg.sender, address(this), maxReward * maxCompletions), "fund fail");
    }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd contracts && npx hardhat test --grep test_createQuest_escrowsMaxPayout`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add contracts && git commit -m "feat(contract): QuestEscrow createQuest with escrowed funding"
```

### Task 3: claim with EIP-712 attestation (one-shot)

**Files:**
- Modify: `contracts/src/QuestEscrow.sol`
- Test: `contracts/test/QuestEscrow.t.sol`

- [ ] **Step 1: Write the failing test (valid signed claim pays the user once)**

```solidity
function _sign(uint256 id, address wallet, uint256 amount, uint256 deadline) internal returns (bytes memory) {
    bytes32 domain = esc.domainSeparator();
    bytes32 structHash = keccak256(abi.encode(
        keccak256("Claim(uint256 questId,address wallet,uint256 amount,uint256 deadline)"),
        id, wallet, amount, deadline));
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xA11CE, digest);
    return abi.encodePacked(r, s, v);
}

function test_claim_oneShot_paysOnce() public {
    vm.prank(sponsor);
    uint256 id = esc.createQuest(target, address(cusd), 2e18, 2e18, 3, QuestEscrow.Kind.OneShot, block.timestamp + 1 days);
    uint256 dl = block.timestamp + 1 hours;
    bytes memory sig = _sign(id, user, 2e18, dl);
    vm.prank(user); esc.claim(id, 2e18, dl, sig);
    assertEq(cusd.balanceOf(user), 2e18);
    // second claim by same user reverts
    bytes memory sig2 = _sign(id, user, 2e18, dl);
    vm.prank(user); vm.expectRevert(bytes("already claimed"));
    esc.claim(id, 2e18, dl, sig2);
}
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd contracts && npx hardhat test --grep test_claim_oneShot_paysOnce`
Expected: FAIL (no `claim`, no `domainSeparator`)

- [ ] **Step 3: Implement EIP-712 domain + claim (one-shot path)**

Add to `QuestEscrow`:

```solidity
bytes32 public immutable domainSeparator;
constructor(address _signer) {
    signer = _signer;
    domainSeparator = keccak256(abi.encode(
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
        keccak256("ShipQuests"), keccak256("1"), block.chainid, address(this)));
}
bytes32 private constant CLAIM_TYPEHASH =
    keccak256("Claim(uint256 questId,address wallet,uint256 amount,uint256 deadline)");

function claim(uint256 questId, uint256 amount, uint256 deadline, bytes calldata sig) external {
    Quest storage q = quests[questId];
    require(q.left > 0, "exhausted");
    require(block.timestamp <= deadline, "expired");
    require(block.timestamp <= q.deadline, "quest over");
    require(amount >= q.minReward && amount <= q.maxReward, "amount oob");
    if (q.kind == Kind.OneShot) {
        require(lastClaim[questId][msg.sender] == 0, "already claimed");
    }
    bytes32 structHash = keccak256(abi.encode(CLAIM_TYPEHASH, questId, msg.sender, amount, deadline));
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    require(_recover(digest, sig) == signer, "bad sig");
    lastClaim[questId][msg.sender] = block.timestamp;
    q.left -= 1;
    require(IERC20(q.token).transfer(msg.sender, amount), "pay fail");
}

function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
    require(sig.length == 65, "siglen");
    bytes32 r; bytes32 s; uint8 v;
    assembly { r := calldataload(sig.offset); s := calldataload(add(sig.offset,32)); v := byte(0, calldataload(add(sig.offset,64))) }
    return ecrecover(digest, v, r, s);
}
```
Remove the standalone `domainSeparator` placeholder if duplicated; keep one immutable set in the constructor.

- [ ] **Step 4: Run test, verify it passes**

Run: `cd contracts && npx hardhat test --grep test_claim_oneShot_paysOnce`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add contracts && git commit -m "feat(contract): EIP-712 attested claim (one-shot) with anti-double-claim"
```

### Task 4: daily claim with 24h cooldown + amount bounds + bad-signer reject

**Files:**
- Modify: `contracts/src/QuestEscrow.sol` (cooldown branch already partially present)
- Test: `contracts/test/QuestEscrow.t.sol`

- [ ] **Step 1: Write failing tests (cooldown enforced; amount out of bounds reverts; wrong signer reverts)**

```solidity
function test_claim_daily_cooldown() public {
    vm.prank(sponsor);
    uint256 id = esc.createQuest(target, address(cusd), 1e18, 5e18, 10, QuestEscrow.Kind.Daily, block.timestamp + 30 days);
    uint256 dl = block.timestamp + 1 hours;
    bytes memory sig = _sign(id, user, 3e18, dl);
    vm.prank(user); esc.claim(id, 3e18, dl, sig);
    // immediate second claim reverts (cooldown)
    uint256 dl2 = block.timestamp + 1 hours;
    bytes memory sig2 = _sign(id, user, 3e18, dl2);
    vm.prank(user); vm.expectRevert(bytes("cooldown"));
    esc.claim(id, 3e18, dl2, sig2);
    // after 24h it works again
    vm.warp(block.timestamp + 24 hours);
    uint256 dl3 = block.timestamp + 1 hours;
    bytes memory sig3 = _sign(id, user, 4e18, dl3);
    vm.prank(user); esc.claim(id, 4e18, dl3, sig3);
    assertEq(cusd.balanceOf(user), 7e18);
}

function test_claim_amountOutOfBounds_reverts() public {
    vm.prank(sponsor);
    uint256 id = esc.createQuest(target, address(cusd), 1e18, 5e18, 10, QuestEscrow.Kind.Daily, block.timestamp + 30 days);
    uint256 dl = block.timestamp + 1 hours;
    bytes memory sig = _sign(id, user, 9e18, dl); // above maxReward
    vm.prank(user); vm.expectRevert(bytes("amount oob"));
    esc.claim(id, 9e18, dl, sig);
}

function test_claim_wrongSigner_reverts() public {
    vm.prank(sponsor);
    uint256 id = esc.createQuest(target, address(cusd), 2e18, 2e18, 3, QuestEscrow.Kind.OneShot, block.timestamp + 1 days);
    uint256 dl = block.timestamp + 1 hours;
    bytes32 domain = esc.domainSeparator();
    bytes32 sh = keccak256(abi.encode(keccak256("Claim(uint256 questId,address wallet,uint256 amount,uint256 deadline)"), id, user, uint256(2e18), dl));
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, sh));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, digest); // wrong key
    vm.prank(user); vm.expectRevert(bytes("bad sig"));
    esc.claim(id, 2e18, dl, abi.encodePacked(r, s, v));
}
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd contracts && npx hardhat test --grep "test_claim_daily_cooldown|amountOutOfBounds|wrongSigner"`
Expected: cooldown test FAILS (no cooldown branch). Add the Daily branch to `claim`:

- [ ] **Step 3: Add the Daily cooldown branch**

In `claim`, replace the kind check with:

```solidity
if (q.kind == Kind.OneShot) {
    require(lastClaim[questId][msg.sender] == 0, "already claimed");
} else {
    require(block.timestamp >= lastClaim[questId][msg.sender] + 24 hours, "cooldown");
}
```
(`amount oob` and `bad sig` are already enforced from Task 3 — those two tests should pass once compiled.)

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd contracts && npx hardhat test`
Expected: ALL pass

- [ ] **Step 5: Commit**

```bash
git add contracts && git commit -m "feat(contract): daily 24h cooldown + amount-bounds + signer guards"
```

### Task 5: withdrawUnclaimed + reentrancy guard

**Files:**
- Modify: `contracts/src/QuestEscrow.sol`
- Test: `contracts/test/QuestEscrow.t.sol`

- [ ] **Step 1: Write failing test (sponsor reclaims remainder after deadline; not before)**

```solidity
function test_withdrawUnclaimed_afterDeadlineOnly() public {
    vm.prank(sponsor);
    uint256 id = esc.createQuest(target, address(cusd), 2e18, 2e18, 5, QuestEscrow.Kind.OneShot, block.timestamp + 1 days);
    vm.prank(sponsor); vm.expectRevert(bytes("not over"));
    esc.withdrawUnclaimed(id);
    vm.warp(block.timestamp + 2 days);
    uint256 before = cusd.balanceOf(sponsor);
    vm.prank(sponsor); esc.withdrawUnclaimed(id);
    assertEq(cusd.balanceOf(sponsor), before + 10e18); // 2e18 * 5, nothing claimed
}
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd contracts && npx hardhat test --grep test_withdrawUnclaimed_afterDeadlineOnly`
Expected: FAIL (no `withdrawUnclaimed`)

- [ ] **Step 3: Implement withdrawUnclaimed + simple reentrancy lock**

```solidity
uint256 private _lock = 1;
modifier nonReentrant() { require(_lock == 1, "reentrant"); _lock = 2; _; _lock = 1; }

mapping(uint256 => bool) public withdrawn;
function withdrawUnclaimed(uint256 questId) external nonReentrant {
    Quest storage q = quests[questId];
    require(msg.sender == q.sponsor, "not sponsor");
    require(block.timestamp > q.deadline, "not over");
    require(!withdrawn[questId], "done");
    withdrawn[questId] = true;
    uint256 remainder = q.maxReward * q.left;
    q.left = 0;
    require(IERC20(q.token).transfer(q.sponsor, remainder), "wd fail");
}
```
Add `nonReentrant` to `claim` too.

- [ ] **Step 4: Run full suite, verify pass**

Run: `cd contracts && npx hardhat test`
Expected: ALL pass

- [ ] **Step 5: Commit**

```bash
git add contracts && git commit -m "feat(contract): withdrawUnclaimed (post-deadline) + reentrancy guard"
```

### Task 6: Deploy to Celo mainnet + verify + generate ABI

**Files:**
- Create: `contracts/script/deploy.ts`, `lib/quest-abi.ts`
- Modify: `contracts/.env.example`

- [ ] **Step 1: Write deploy script (viem, prints address + verify cmd)**

Adapt DropRank's `contracts/script/deploy.ts`: deploy `QuestEscrow` with constructor arg `SIGNER_ADDRESS` (the backend attestor address, holds no funds). Print deployed address + the exact `npx hardhat verify --network celo <addr> <SIGNER_ADDRESS>` command.

- [ ] **Step 2: Deploy to Alfajores testnet first (dry run)**

```bash
cd contracts
npx hardhat keystore set DEPLOYER_PRIVATE_KEY
export SIGNER_ADDRESS=0x<backend signer addr>   # from scripts/generate-signer (reuse DropRank's)
npm run deploy -- --network alfajores
```
Expected: prints a deployed address; mint test cUSD and run one createQuest+claim manually.

- [ ] **Step 3: Deploy to Celo mainnet + verify on Celoscan**

```bash
npm run deploy -- --network celo
npx hardhat verify --network celo <DEPLOYED_ADDRESS> <SIGNER_ADDRESS>
```
Expected: verified contract on celoscan.

- [ ] **Step 4: Generate the typed ABI for frontend/backend**

Create `lib/quest-abi.ts` exporting `QUEST_ESCROW_ADDRESS` (mainnet), the ABI (from the build artifact), and `CLAIM_TYPES`/`domain` EIP-712 helpers (mirror DropRank's `lib/badge-abi.ts`).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(deploy): QuestEscrow live on Celo mainnet + typed ABI"
```

---

## Phase 2 — Backend verification + attestation (J6-7)

### Task 7: Onchain completion verification (`lib/celo-read.ts`)

**Files:**
- Create: `lib/celo-read.ts`, `lib/celo-read.test.ts`

- [ ] **Step 1: Write the failing test (mock RPC: a tx from wallet to target after questStart → verified)**

```ts
import { describe, it, expect, vi } from "vitest";
import { hasCompletedQuest } from "./celo-read";

it("returns true when wallet has a successful tx to the target after questStart", async () => {
  const fakeTxs = [{ to: "0xdead", from: "0xuser", isError: "0", timeStamp: "2000" }];
  const fetcher = vi.fn().mockResolvedValue(fakeTxs);
  const ok = await hasCompletedQuest("0xuser", "0xdead", 1000, fetcher);
  expect(ok).toBe(true);
});

it("returns false when only pre-quest or failed txs exist", async () => {
  const fetcher = vi.fn().mockResolvedValue([{ to: "0xdead", from: "0xuser", isError: "1", timeStamp: "2000" }]);
  expect(await hasCompletedQuest("0xuser", "0xdead", 1000, fetcher)).toBe(false);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run lib/celo-read.test.ts`
Expected: FAIL (no module)

- [ ] **Step 3: Implement `hasCompletedQuest` (pure, fetcher-injected — same keyless Blockscout pattern as DropRank)**

```ts
type Tx = { to: string; from: string; isError: string; timeStamp: string };
export type TxFetcher = (wallet: string) => Promise<Tx[]>;

export async function defaultFetcher(wallet: string): Promise<Tx[]> {
  const url = `https://explorer.celo.org/api?module=account&action=txlist&address=${wallet}&sort=desc`;
  const r = await fetch(url);
  const j = await r.json();
  return Array.isArray(j.result) ? j.result : [];
}

export async function hasCompletedQuest(wallet: string, target: string, questStart: number, fetcher: TxFetcher = defaultFetcher): Promise<boolean> {
  const txs = await fetcher(wallet);
  const w = wallet.toLowerCase(), t = target.toLowerCase();
  return txs.some(tx => tx.to?.toLowerCase() === t && tx.from?.toLowerCase() === w && tx.isError === "0" && Number(tx.timeStamp) >= questStart);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run lib/celo-read.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib && git commit -m "feat(backend): onchain quest completion verification (keyless Celo explorer)"
```

### Task 8: EIP-712 attestation signer (`lib/attest.ts`)

**Files:**
- Create: `lib/attest.ts`, `lib/attest.test.ts`

- [ ] **Step 1: Write the failing test (signed digest recovers to the signer address)**

```ts
import { it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { signClaim } from "./attest";
import { recoverTypedDataAddress } from "viem";

it("produces a signature recoverable to the signer", async () => {
  const pk = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const acct = privateKeyToAccount(pk);
  const { signature, types, domain, message } = await signClaim({ questId: 1n, wallet: "0x000000000000000000000000000000000000dEaD", amount: 2n, deadline: 9999999999n, signerPk: pk, contract: "0x0000000000000000000000000000000000000001", chainId: 42220 });
  const rec = await recoverTypedDataAddress({ domain, types, primaryType: "Claim", message, signature });
  expect(rec.toLowerCase()).toBe(acct.address.toLowerCase());
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run lib/attest.test.ts`
Expected: FAIL (no module)

- [ ] **Step 3: Implement `signClaim`**

```ts
import { privateKeyToAccount } from "viem/accounts";

export async function signClaim(p: {
  questId: bigint; wallet: `0x${string}`; amount: bigint; deadline: bigint;
  signerPk: `0x${string}`; contract: `0x${string}`; chainId: number;
}) {
  const account = privateKeyToAccount(p.signerPk);
  const domain = { name: "ShipQuests", version: "1", chainId: p.chainId, verifyingContract: p.contract } as const;
  const types = { Claim: [
    { name: "questId", type: "uint256" }, { name: "wallet", type: "address" },
    { name: "amount", type: "uint256" }, { name: "deadline", type: "uint256" },
  ] } as const;
  const message = { questId: p.questId, wallet: p.wallet, amount: p.amount, deadline: p.deadline };
  const signature = await account.signTypedData({ domain, types, primaryType: "Claim", message });
  return { signature, domain, types, message };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run lib/attest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib && git commit -m "feat(backend): EIP-712 claim attestation signer"
```

### Task 9: `/api/attest/[questId]` route (verify → pick amount → sign)

**Files:**
- Create: `app/api/attest/[questId]/route.ts`
- Modify: `.env.example` (add `SIGNER_PRIVATE_KEY`, `QUEST_ESCROW_ADDRESS`)

- [ ] **Step 1: Write the route (no separate test — exercised in E2E Task 13)**

```ts
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { hasCompletedQuest } from "@/lib/celo-read";
import { signClaim } from "@/lib/attest";
import { readQuestOnchain } from "@/lib/quest-abi"; // small viem read: returns {target,minReward,maxReward,deadline,start}

export async function POST(req: NextRequest, ctx: { params: Promise<{ questId: string }> }) {
  const { questId } = await ctx.params;
  const { wallet } = await req.json();
  if (!isAddress(wallet)) return NextResponse.json({ error: "bad wallet" }, { status: 400 });
  const q = await readQuestOnchain(BigInt(questId));
  const done = await hasCompletedQuest(wallet, q.target, q.start);
  if (!done) return NextResponse.json({ error: "quest not completed onchain yet" }, { status: 409 });
  // pick reward in [min,max] off-chain (mystery for daily; == for one-shot). Non-predictable, bounded onchain.
  const span = q.maxReward - q.minReward;
  const amount = span === 0n ? q.minReward : q.minReward + (BigInt(Date.now()) % (span + 1n)); // simple bounded pick; replace w/ crypto rand
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const { signature } = await signClaim({
    questId: BigInt(questId), wallet, amount, deadline,
    signerPk: process.env.SIGNER_PRIVATE_KEY as `0x${string}`,
    contract: process.env.QUEST_ESCROW_ADDRESS as `0x${string}`, chainId: 42220,
  });
  return NextResponse.json({ amount: amount.toString(), deadline: deadline.toString(), signature });
}
```
Note: replace the `Date.now()` pick with `crypto.getRandomValues` bounded to span before launch (still off-chain, bounded onchain — no security dependency on it).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(api): attest route — verify completion onchain, sign bounded reward"
```

---

## Phase 3 — MiniApp (J3-5, claim path first)

### Task 10: MiniPay connection hook

**Files:**
- Create: `app/_components/useMiniPay.ts`

- [ ] **Step 1: Implement the hook (MiniPay injects `window.ethereum`; auto-connect, Celo chain)**

```ts
"use client";
import { useEffect, useState } from "react";
import { createWalletClient, custom, type Address } from "viem";
import { celo } from "viem/chains";

export function useMiniPay() {
  const [address, setAddress] = useState<Address | null>(null);
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    eth.request({ method: "eth_requestAccounts" }).then((a: Address[]) => setAddress(a[0] ?? null));
  }, []);
  const client = typeof window !== "undefined" && (window as any).ethereum
    ? createWalletClient({ chain: celo, transport: custom((window as any).ethereum) })
    : null;
  return { address, client };
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` → 0 errors
```bash
git add app && git commit -m "feat(miniapp): MiniPay connection hook"
```

### Task 11: Quest list page

**Files:**
- Modify: `app/page.tsx`
- Create: `lib/quest-abi.ts` read helpers `listQuests()` (if not already)

- [ ] **Step 1: Implement the list (reads quests onchain via public client, renders cards)**

Render each active quest: title/target, reward range (`min–max cUSD` or fixed), kind badge (DAILY/ONE-SHOT), completions left, and a link to `/quest/[id]`. Use a viem `publicClient` (Celo) reading `quests(id)` from `nextId-1` down to 1, filtering `left > 0 && deadline > now`.

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` → 0 errors
```bash
git add -A && git commit -m "feat(miniapp): quest list page"
```

### Task 12: Quest detail + claim flow

**Files:**
- Create: `app/quest/[id]/page.tsx`

- [ ] **Step 1: Implement the claim flow**

Steps in the UI: (1) "I did it / Verify" → `POST /api/attest/[id]` with `{wallet}`; (2) on 200, call `QuestEscrow.claim(id, amount, deadline, signature)` via the MiniPay wallet client; (3) on receipt, show success + amount. Handle 409 ("complete the action first → link to target app") and the daily cooldown message.

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` → 0 errors
```bash
git add app && git commit -m "feat(miniapp): quest detail + verify→claim flow"
```

---

## Phase 4 — Seed, E2E, launch (J8+)

### Task 13: Seed first quest + end-to-end on mainnet

**Files:**
- Create: `scripts/seed-quest.mjs`

- [ ] **Step 1: Write the seed script**

`scripts/seed-quest.mjs` (viem + DEPLOYER key from keystore/env): approve cUSD to the escrow, call `createQuest` with a real, useful action target (e.g. "make a swap on <a real Celo dapp>" or a simple ShipQuests demo target), small pot. Print the questId.

- [ ] **Step 2: Run it on mainnet**

```bash
node scripts/seed-quest.mjs
```
Expected: prints questId; quest appears in the list page.

- [ ] **Step 3: Full E2E (real wallet)**

In MiniPay (or a Celo wallet): do the target action, then run verify→claim on the quest page. Confirm cUSD received and a `claim` tx on Celoscan.

- [ ] **Step 4: Commit**

```bash
git add scripts && git commit -m "chore: seed-quest script + verified E2E on Celo mainnet"
```

### Task 14: Sponsor create-quest form (fast-follow)

**Files:**
- Create: `app/sponsor/page.tsx`

- [ ] **Step 1: Implement the form**

Inputs: target contract, token (cUSD default), minReward, maxReward, maxCompletions, kind (one-shot/daily), deadline. Flow: `approve(cUSD, escrow, maxReward*maxCompletions)` → `createQuest(...)` via MiniPay client. Show the resulting questId + shareable link.

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` → 0 errors
```bash
git add app && git commit -m "feat(miniapp): self-serve sponsor create-quest form"
```

### Task 15: Ship hygiene + submission

- [ ] **Step 1:** README (what/why/how, Celo mainnet address, open source) + LICENSE (MIT) + GitHub topics (celo, minipay, web3, quest-to-earn).
- [ ] **Step 2:** Push public repo `Lrifton92/shipquests`, ensure GitHub active over the period.
- [ ] **Step 3:** Create + configure the project on talent.app, register it in the active Proof of Ship campaign.
- [ ] **Step 4:** Commit + announce in the Proof of Ship Telegram (amorçage builders).

---

## Self-Review

- **Spec coverage:** createQuest/claim/withdraw (§5.1) → Tasks 2-5 ✓ · EIP-712 off-chain verify + attest (§4, §5.2) → Tasks 7-9 ✓ · MiniApp + MiniPay compat (§5.3) → Tasks 10-12,14 ✓ · daily box variable bounded reward (§6bis) → Tasks 2-4 (kind/min/max/cooldown) + Task 9 (off-chain pick) ✓ · anti-sybil substance (§7) → enforced by "real action target" in seed/sponsor + onchain verify ✓ · plan J1-15 (§8) → phases mapped ✓ · eligibility mainnet+open-source+activity (§10) → Tasks 6,13,15 ✓.
- **Placeholder scan:** the only deferred detail is the reward-pick RNG in Task 9 (flagged: swap `Date.now()` → `crypto.getRandomValues`, bounded onchain so non-security-critical) — acceptable, explicitly noted.
- **Type consistency:** `claim(questId,amount,deadline,sig)`, `Claim(uint256 questId,address wallet,uint256 amount,uint256 deadline)`, `Kind{OneShot,Daily}`, `lastClaim[questId][wallet]` consistent across contract, tests, attest.ts, and route.
