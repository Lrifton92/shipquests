import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { hasCompletedQuest } from "@/lib/celo-read";
import { signClaim } from "@/lib/attest";
import { readQuestOnchain, QUEST_ESCROW_ADDRESS, CELO_CHAIN_ID } from "@/lib/quest-abi";
import { accrueEarning, incrPaid, markRefereeActive, owedWei } from "@/lib/referral";

// The referral quest (created onchain by the sponsor; its id goes in this env).
// When claiming THIS quest we skip the onchain action check and instead require
// the wallet to have an unclaimed referral bonus available off-chain.
const REFERRAL_QUEST_ID = process.env.NEXT_PUBLIC_REFERRAL_QUEST_ID;

/**
 * Pick a reward in [min, max] inclusive, off-chain and non-predictable.
 * Uses crypto.getRandomValues (not Date.now) so the daily-box amount cannot be
 * gamed by timing. Security does not depend on this: the contract bounds amount
 * to [minReward, maxReward] regardless, so the worst case is a payout within range.
 */
function pickBoundedReward(min: bigint, max: bigint): bigint {
  const span = max - min;
  if (span <= 0n) return min;
  const range = span + 1n;
  // Rejection sampling over 64 random bits to avoid modulo bias.
  const max64 = 1n << 64n;
  const limit = max64 - (max64 % range);
  const buf = new BigUint64Array(1);
  let r: bigint;
  do {
    crypto.getRandomValues(buf);
    r = buf[0];
  } while (r >= limit);
  return min + (r % range);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ questId: string }> }) {
  const { questId } = await ctx.params;
  const { wallet } = await req.json();
  if (!isAddress(wallet)) {
    return NextResponse.json({ error: "bad wallet" }, { status: 400 });
  }

  const q = await readQuestOnchain(BigInt(questId));

  const isReferralQuest = REFERRAL_QUEST_ID !== undefined && questId === REFERRAL_QUEST_ID;

  // amount carried in the signed attestation; bounded onchain to [min, max].
  let amount: bigint;
  if (isReferralQuest) {
    // Referral bonus: no onchain action to verify. Pay the sponsor's owed bonus
    // (pct% of their referees' earnings, minus already-paid), capped per claim
    // at maxReward. Require owed >= minReward so we never over-pay a dust bonus.
    const owed = await owedWei(wallet);
    if (owed < q.minReward) {
      return NextResponse.json({ error: "no referral bonus yet" }, { status: 409 });
    }
    amount = owed > q.maxReward ? q.maxReward : owed;
  } else {
    const done = await hasCompletedQuest(wallet, q.target, q.start);
    if (!done) {
      return NextResponse.json({ error: "quest not completed onchain yet" }, { status: 409 });
    }
    amount = pickBoundedReward(q.minReward, q.maxReward);
    // Real quest completed onchain → mark this wallet active for its sponsor and
    // accrue the sponsor's referral share. Both no-op without a sponsor / KV;
    // neither blocks the signature.
    await markRefereeActive(wallet);
    await accrueEarning(wallet, questId, amount);
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const { signature } = await signClaim({
    questId: BigInt(questId),
    wallet,
    amount,
    deadline,
    signerPk: process.env.SIGNER_PRIVATE_KEY as `0x${string}`,
    contract: QUEST_ESCROW_ADDRESS,
    chainId: CELO_CHAIN_ID,
  });

  if (isReferralQuest) {
    // Count this bonus as paid as soon as we sign it. KNOWN MVP TRADE-OFF: if the
    // sponsor never broadcasts the claim onchain, this amount is burned off-chain
    // (paid advanced but no tx landed). We accept this for MVP rather than tracking
    // onchain confirmation; the contract still bounds the payout, so the worst case
    // is a sponsor losing a bonus they chose not to broadcast — never an
    // over-payment or double-claim.
    await incrPaid(wallet, amount);
  }

  return NextResponse.json({
    amount: amount.toString(),
    deadline: deadline.toString(),
    signature,
  });
}
