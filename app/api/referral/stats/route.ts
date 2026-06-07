import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { REFERRAL_PCT, countActive, getEarnedMicro, microToWei, owedWei } from "@/lib/referral";

// GET ?wallet=0x… — referral stats for a sponsor. All values are 0 when KV is
// absent (local dev), so the Invite UI renders cleanly with no store attached.
//   active     — distinct active referees (friends referred)
//   earnedWei  — total cUSD their referees have earned (drives the "10% of X" copy)
//   owedWei    — claimable referral bonus right now
//   pct        — sponsor's share of referee earnings, in percent
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: "bad wallet" }, { status: 400 });
  }
  const [active, earnedMicro, owed] = await Promise.all([
    countActive(wallet),
    getEarnedMicro(wallet),
    owedWei(wallet),
  ]);
  return NextResponse.json({
    active,
    earnedWei: microToWei(earnedMicro).toString(),
    owedWei: owed.toString(),
    pct: REFERRAL_PCT,
  });
}
