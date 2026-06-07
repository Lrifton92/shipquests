import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { hasCompletedQuest } from "@/lib/celo-read";
import { signClaim } from "@/lib/attest";
import { readQuestOnchain, QUEST_ESCROW_ADDRESS, CELO_CHAIN_ID } from "@/lib/quest-abi";
import { eligibleBonuses, incrRewarded, markRefereeActive } from "@/lib/referral";

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

  if (isReferralQuest) {
    // Referral bonus: no onchain action to verify. The sponsor (wallet) may claim
    // one bonus per distinct active referee, capped by eligibleBonuses().
    const eligible = await eligibleBonuses(wallet);
    if (eligible <= 0) {
      return NextResponse.json({ error: "no active referral yet" }, { status: 409 });
    }
  } else {
    const done = await hasCompletedQuest(wallet, q.target, q.start);
    if (!done) {
      return NextResponse.json({ error: "quest not completed onchain yet" }, { status: 409 });
    }
    // Real quest completed onchain → advance this wallet's sponsor (if any).
    // try/catch inside markRefereeActive; never blocks the signature.
    await markRefereeActive(wallet);
  }

  const amount = pickBoundedReward(q.minReward, q.maxReward);
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
    // Count this bonus as rewarded as soon as we sign it. KNOWN MVP TRADE-OFF:
    // if the sponsor never broadcasts the claim onchain, this bonus is burned
    // off-chain (the counter advanced but no tx landed). We accept this for MVP
    // rather than tracking onchain confirmation; the contract still bounds the
    // payout, so the worst case is a sponsor losing one *eligible* bonus they
    // chose not to broadcast — never an over-payment or double-claim.
    await incrRewarded(wallet);
  }

  return NextResponse.json({
    amount: amount.toString(),
    deadline: deadline.toString(),
    signature,
  });
}
