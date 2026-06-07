import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { countActive, eligibleBonuses } from "@/lib/referral";

// GET ?wallet=0x… — referral stats for a sponsor. Both numbers are 0 when KV is
// absent (local dev), so the Invite UI renders cleanly with no store attached.
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: "bad wallet" }, { status: 400 });
  }
  const [active, eligible] = await Promise.all([
    countActive(wallet),
    eligibleBonuses(wallet),
  ]);
  return NextResponse.json({ active, eligible });
}
