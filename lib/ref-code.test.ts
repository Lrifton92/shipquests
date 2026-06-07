import { it, expect, describe } from "vitest";
import { isRefCode, generateCode, normalizeCode, CODE_LEN, CODE_ALPHABET } from "./ref-code";

describe("isRefCode", () => {
  it("accepts a well-formed 6-char code (case-insensitive)", () => {
    expect(isRefCode("K7P2QX")).toBe(true);
    expect(isRefCode("k7p2qx")).toBe(true); // uppercased internally
  });

  it("rejects wrong length", () => {
    expect(isRefCode("K7P2Q")).toBe(false);
    expect(isRefCode("K7P2QX7")).toBe(false);
  });

  it("rejects ambiguous / out-of-alphabet chars (I L O U, punctuation)", () => {
    expect(isRefCode("IIIIII")).toBe(false);
    expect(isRefCode("LOUUUU")).toBe(false);
    expect(isRefCode("K7-2QX")).toBe(false);
  });

  it("rejects a wallet address (length guards against it)", () => {
    expect(isRefCode("0x000000000000000000000000000000000000dEaD")).toBe(false);
  });
});

describe("generateCode", () => {
  it("returns a valid code of the right length within the alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateCode();
      expect(c).toHaveLength(CODE_LEN);
      expect(isRefCode(c)).toBe(true);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it("is overwhelmingly unique across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateCode());
    // 500 draws over ~1.07e9 space: collisions are astronomically unlikely.
    expect(seen.size).toBe(500);
  });
});

describe("normalizeCode", () => {
  it("uppercases", () => {
    expect(normalizeCode("k7p2qx")).toBe("K7P2QX");
  });
});
