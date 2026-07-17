# Seed quests — values to enter in /sponsor

These are the 5 starter quests. Create each one in the **Create** tab (`/sponsor`)
with the values below. The escrow locks `Max reward × Max completions` per quest,
so the **worst-case total you fund is ~1.69 cUSD** (+ a little CELO for gas).

> **Scripted seeding (one quest, keystore-signed).** Instead of the UI you can run
> `contracts/script/seed-quest.ts` — it does `approve` + `createQuest` in one signed
> run on the v1.1 escrow (`0x5fe1c9c7fd942245f0145204f6285310a466d6bf`). It refuses
> to run unless the sponsor (`DEPLOYER_PRIVATE_KEY`, i.e. `0x1dee…`) holds enough cUSD.
> Defaults reproduce the daily G$ box (0.02–0.15 × 4 = 0.60 cUSD). Override with env:
> `TARGET, MIN_REWARD, MAX_REWARD, COMPLETIONS, KIND, DEADLINE_DAYS`.
>
> ```
> cd contracts
> CELO_RPC_URL=https://forno.celo.org npx hardhat run script/seed-quest.ts --network celo
> ```
>
> ⚠️ As of 2026-07-17 both `0x1dee` and the old sponsor `0x6B8F…182769` hold **0 cUSD**,
> so 0x1dee must be topped up first (MiniPay → send cUSD to `0x1dee…`, or bridge).

The app shows real titles/descriptions for these targets automatically (mapping
in `lib/quest-meta.ts`, keyed by the **target address**). Any other target falls
back to the generic "Quest #N" copy.

> Reward token is **cUSD** for all quests:
> `0x765DE816845861e75A25fCA122bb6898B8B1282a`
> (Note: its on-chain `symbol()` now reads `USDm` after Mento's rebrand — the
> address is still the canonical Celo dollar.)

---

## 1. Send your first cUSD — ONE-SHOT

| Field            | Value |
|------------------|-------|
| Action target    | `0x765DE816845861e75A25fCA122bb6898B8B1282a` |
| Reward token     | cUSD (default) |
| Min reward       | `0.05` |
| Max reward       | `0.05` |
| Max completions  | `5` |
| Type             | One-shot |
| Deadline         | 14 days |

Locks: 0.05 × 5 = **0.25 cUSD**.

## 2. Swap on Ubeswap — ONE-SHOT

| Field            | Value |
|------------------|-------|
| Action target    | `0xE3D8bd6Aed4F159bc8000a9cD47CffDb95F96121` |
| Reward token     | cUSD (default) |
| Min reward       | `0.08` |
| Max reward       | `0.08` |
| Max completions  | `4` |
| Type             | One-shot |
| Deadline         | 14 days |

Locks: 0.08 × 4 = **0.32 cUSD**.

## 3. Swap a stablecoin on Mento — ONE-SHOT

| Field            | Value |
|------------------|-------|
| Action target    | `0x777A8255cA72412f0d706dc03C9D1987306B4CaD` |
| Reward token     | cUSD (default) |
| Min reward       | `0.07` |
| Max reward       | `0.07` |
| Max completions  | `4` |
| Type             | One-shot |
| Deadline         | 14 days |

Locks: 0.07 × 4 = **0.28 cUSD**.

## 4. Claim your daily G$ — DAILY box (variable reward)

| Field            | Value |
|------------------|-------|
| Action target    | `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A` |
| Reward token     | cUSD (default) |
| Min reward       | `0.02` |
| Max reward       | `0.15` |
| Max completions  | `4` |
| Type             | Daily box |
| Deadline         | 30 days |

Locks the worst case: 0.15 × 4 = **0.60 cUSD**.
This is the quest that shows the daily mystery-box UI (variable 0.02–0.15).

## 5. Get some cEUR — ONE-SHOT

| Field            | Value |
|------------------|-------|
| Action target    | `0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73` |
| Reward token     | cUSD (default) |
| Min reward       | `0.06` |
| Max reward       | `0.06` |
| Max completions  | `4` |
| Type             | One-shot |
| Deadline         | 14 days |

Locks: 0.06 × 4 = **0.24 cUSD**.

---

## Target addresses — sources & reliability

All addresses were verified on **Celo mainnet** via on-chain reads (viem):
bytecode present (= real contract) + a characteristic call returning the expected
shape. None are invented.

| # | Target | Address | Verification | Reliability |
|---|--------|---------|--------------|-------------|
| 1 | cUSD token | `0x765DE816845861e75A25fCA122bb6898B8B1282a` | `symbol()=USDm`, `decimals()=18`; canonical Celo dollar (in brief, Celo docs) | Very high |
| 2 | Ubeswap V2 router | `0xE3D8bd6Aed4F159bc8000a9cD47CffDb95F96121` | `factory()` returns Ubeswap V2 factory `0x62d5b84bE28a183aBB507E125B384122D2C25fAE` — confirms identity | High |
| 3 | Mento Broker | `0x777A8255cA72412f0d706dc03C9D1987306B4CaD` | `getExchangeProviders()` returns BiPoolManager `0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901` | High |
| 4 | GoodDollar G$ token | `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A` | `symbol()=G$`, `decimals()=18` | High |
| 5 | cEUR token | `0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73` | `symbol()=EURm`, `decimals()=18`; canonical Celo euro (Celo docs) | Very high |

### Note on completion verification

`lib/celo-read.ts` marks a quest complete when the player's wallet has a
successful tx **to the target address**. For the token-address targets
(1, 5) that means an interaction recorded against the token contract (e.g. an
ERC-20 `transfer`), which a normal send/receive produces. For the router/broker
targets (2, 3) it's the swap tx. For G$ (4) it's the UBI claim tx.
This is the same keyless check the app already used — no backend change.
