import { it, expect, vi } from "vitest";
import { hasCompletedQuest } from "./celo-read";

it("returns true when wallet has a successful tx to the target after questStart", async () => {
  const fakeTxs = [{ to: "0xdead", from: "0xuser", isError: "0", timeStamp: "2000" }];
  const fetcher = vi.fn().mockResolvedValue(fakeTxs);
  const ok = await hasCompletedQuest("0xuser", "0xdead", 1000, fetcher);
  expect(ok).toBe(true);
});

it("returns false when only pre-quest or failed txs exist", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue([{ to: "0xdead", from: "0xuser", isError: "1", timeStamp: "2000" }]);
  expect(await hasCompletedQuest("0xuser", "0xdead", 1000, fetcher)).toBe(false);
});
