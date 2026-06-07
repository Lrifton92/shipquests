# ShipQuests

**Quest-to-earn on Celo / MiniPay. Do a real onchain action, get verified onchain, claim cUSD.**

Sponsors fund a quest ("do X on my app → earn cUSD"). Users complete the action, the backend **verifies it onchain** and signs an EIP-712 attestation, and users claim their reward from an onchain escrow — fixed (one-shot) or a variable **daily box**. No forms, no fees, no jargon.

Built for [Celo Proof of Ship](https://celoplatform.notion.site/Proof-of-Ship-17cd5cb803de8060ba10d22a72b549f8).

## Live

- **Contract (Celo mainnet):** [`0x2f575fb83A3c71f7E5C482b19a3C33F8146b491f`](https://celoscan.io/address/0x2f575fb83A3c71f7E5C482b19a3C33F8146b491f)
- Reward token: cUSD (`0x765DE816845861e75A25fCA122bb6898B8B1282a`)

## How it works

1. **Sponsor** creates a quest and escrows the reward pot onchain (`createQuest`).
2. **User** performs the required action on the sponsor's contract.
3. **Backend** reads Celo onchain to confirm the action, then signs an **EIP-712 attestation** (`Claim(questId, wallet, amount, deadline)`) with a trusted signer — no onchain randomness, the reward amount is bounded onchain.
4. **User** claims; the escrow verifies the signature and pays out cUSD. One-shot = once per wallet; daily = a 24h-cooldown mystery box (variable amount within the sponsor's range).

## Stack

Next.js (App Router) · viem · Solidity 0.8.24 · Celo mainnet · MiniPay (`window.ethereum`) · EIP-712 trusted-signer escrow.

## Structure

```
contracts/src/QuestEscrow.sol   # escrow + EIP-712 claim (6 forge-std tests)
lib/celo-read.ts                # keyless onchain completion check
lib/attest.ts                   # EIP-712 attestation signer (server-only)
app/                            # MiniApp: quests, claim, sponsor, history, settings
app/api/attest/[questId]        # verify onchain + sign attestation
```

## Develop

```bash
npm install
npm run dev            # http://localhost:3000
cd contracts && npx hardhat test   # contract tests
```

Env (`.env.local`): `SIGNER_PRIVATE_KEY` (server), `NEXT_PUBLIC_QUEST_ESCROW_ADDRESS`, `NEXT_PUBLIC_CELO_RPC_URL`.

## License

MIT
