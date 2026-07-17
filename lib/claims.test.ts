import { describe, expect, it } from "vitest";
import { parseClaimLogs } from "./claims";

type L = Parameters<typeof parseClaimLogs>[0][number];

function log(questId: bigint, amount: bigint, streak: bigint, blockNumber: bigint): L {
  return { args: { questId, wallet: "0xabc", amount, streak }, blockNumber } as unknown as L;
}

describe("parseClaimLogs", () => {
  it("maps event args and sorts newest block first", () => {
    const out = parseClaimLogs([
      log(1n, 2000000000000000000n, 1n, 100n),
      log(3n, 500000000000000000n, 4n, 300n),
      log(1n, 1000000000000000000n, 2n, 200n),
    ]);
    expect(out.map((e) => e.blockNumber)).toEqual([300n, 200n, 100n]);
    expect(out[0]).toMatchObject({ questId: "3", streak: 4, amount: 500000000000000000n });
    expect(out.every((e) => e.claimedAt === 0)).toBe(true);
  });

  it("tolerates missing args (defensive zero-fill)", () => {
    const out = parseClaimLogs([{ args: {}, blockNumber: undefined } as unknown as L]);
    expect(out[0]).toMatchObject({ questId: "0", amount: 0n, streak: 0, blockNumber: 0n });
  });
});
