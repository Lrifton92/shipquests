// Quest metadata, keyed by the on-chain `target` address (lowercase).
//
// Why by target and not by questId: the QuestEscrow contract only stores
// addresses/amounts, never a title/description. Keying by target makes the
// human copy robust to seed order — quest #3 vs #7 doesn't matter, only which
// contract the player must touch. A target with no entry falls back to the
// generic "Quest #N / interact with the sponsor's app" copy (unchanged behavior).
//
// titleKey/actionKey reference i18n keys (see lib/i18n/*). The display layer
// resolves them with the active locale; consumers without an i18n context can
// fall back to the bundled EN dictionary.

import type { Dict } from "./i18n/en";

export type QuestMeta = {
  /** i18n key for the short title. */
  titleKey: keyof Dict;
  /** i18n key for the one-line action description. */
  actionKey: keyof Dict;
  /** Decorative glyph shown next to the title. */
  icon: string;
  /**
   * Direct link to the dapp where the player performs the action. When set, the
   * detail page shows a primary "Do the action ↗" button opening this URL in a
   * new tab. Omitted for actions done from the wallet itself (e.g. a cUSD send),
   * where the player follows the textual step instead.
   */
  actionUrl?: string;
  /** i18n key for the step-by-step instructions shown under step 1. */
  stepsKey?: keyof Dict;
};

// Celo mainnet targets — every address below is a real, verified contract
// (checked on-chain via viem: bytecode present + characteristic call).
// See docs/seed-quests.md for sources and reliability notes.
const META: Record<string, QuestMeta> = {
  // cUSD stablecoin token — canonical Celo address.
  "0x765de816845861e75a25fca122bb6898b8b1282a": {
    titleKey: "meta.sendCusd.title",
    actionKey: "meta.sendCusd.action",
    icon: "↗",
    // No third-party dapp: the action is a plain wallet send.
    stepsKey: "meta.sendCusd.steps",
  },
  // Ubeswap V2 router.
  "0xe3d8bd6aed4f159bc8000a9cd47cffdb95f96121": {
    titleKey: "meta.ubeswap.title",
    actionKey: "meta.ubeswap.action",
    icon: "⇄",
    actionUrl: "https://app.ubeswap.org",
    stepsKey: "meta.ubeswap.steps",
  },
  // Mento Broker (stablecoin swaps).
  "0x777a8255ca72412f0d706dc03c9d1987306b4cad": {
    titleKey: "meta.mento.title",
    actionKey: "meta.mento.action",
    icon: "◎",
    actionUrl: "https://app.mento.org",
    stepsKey: "meta.mento.steps",
  },
  // GoodDollar (G$) token — daily UBI claims live here.
  "0x62b8b11039fcfe5ab0c56e502b1c372a3d2a9c7a": {
    titleKey: "meta.gooddollar.title",
    actionKey: "meta.gooddollar.action",
    icon: "✦",
    actionUrl: "https://gooddapp.org",
    stepsKey: "meta.gooddollar.steps",
  },
  // cEUR stablecoin token — canonical Celo address.
  "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73": {
    titleKey: "meta.ceur.title",
    actionKey: "meta.ceur.action",
    icon: "€",
    actionUrl: "https://app.mento.org",
    stepsKey: "meta.ceur.steps",
  },
};

/** Metadata for a target address, or null if the target is unknown. */
export function questMetaFor(target: string): QuestMeta | null {
  return META[target.toLowerCase()] ?? null;
}
