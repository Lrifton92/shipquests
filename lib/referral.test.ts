import { it, expect, describe } from "vitest";
import { weiToMicro, microToWei, computeOwedMicro } from "./referral";

const CUSD = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n; // n cUSD in wei

describe("wei <-> micro-cUSD", () => {
  it("round-trips whole micro units", () => {
    expect(weiToMicro(CUSD(0.1))).toBe(100_000); // 0.10 cUSD = 100k micro
    expect(microToWei(100_000)).toBe(CUSD(0.1));
    expect(weiToMicro(microToWei(42))).toBe(42);
  });

  it("floors sub-micro dust instead of overflowing", () => {
    // 0.10 cUSD + 1 wei dust -> still 100k micro (the 1 wei is below 1e-6 cUSD).
    expect(weiToMicro(CUSD(0.1) + 1n)).toBe(100_000);
  });

  it("stays a safe JS integer for large totals (no int64 overflow path)", () => {
    // 1000 cUSD earned across many referees: micro = 1e9, far under Number.MAX_SAFE_INTEGER.
    const micro = weiToMicro(CUSD(1000));
    expect(micro).toBe(1_000_000_000);
    expect(Number.isSafeInteger(micro)).toBe(true);
  });
});

describe("computeOwedMicro (earned * pct - paid, clamped >= 0)", () => {
  it("applies the percentage to earned and subtracts paid", () => {
    // friends earned 1.00 cUSD (1e6 micro), 10% -> 100k micro owed, none paid yet.
    expect(computeOwedMicro(1_000_000, 0, 10)).toBe(100_000);
  });

  it("subtracts already-paid bonuses", () => {
    // 10% of 2.00 cUSD = 200k micro, 50k already paid -> 150k owed.
    expect(computeOwedMicro(2_000_000, 50_000, 10)).toBe(150_000);
  });

  it("never goes negative when overpaid", () => {
    expect(computeOwedMicro(1_000_000, 999_999, 10)).toBe(0);
  });

  it("floors fractional percentage results", () => {
    // 10% of 1 micro = 0.1 micro -> floors to 0.
    expect(computeOwedMicro(1, 0, 10)).toBe(0);
    // 10% of 15 micro = 1.5 -> floors to 1.
    expect(computeOwedMicro(15, 0, 10)).toBe(1);
  });
});
