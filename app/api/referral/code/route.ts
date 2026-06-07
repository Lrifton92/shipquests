import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getOrCreateCode } from "@/lib/referral";

// GET ?wallet=0x… — the sponsor's stable invite code (minted once, never changes).
// Returns { code: null } when KV is absent, so the Invite UI falls back to the raw
// ?ref=<wallet> link with no error.
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: "bad wallet" }, { status: 400 });
  }
  const code = await getOrCreateCode(wallet);
  return NextResponse.json({ code });
}
