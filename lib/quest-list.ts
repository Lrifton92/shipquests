// Frontend quest list/detail data layer.
// Reads quests onchain via the existing quest-abi public client; falls back to a
// small mock set when the contract isn't deployed yet (QUEST_ESCROW_ADDRESS is the
// zero placeholder) or a read fails — so the MiniApp still renders a real-looking
// UI before launch. `isMock` is surfaced to the user honestly in the UI.
import { createPublicClient, http, formatUnits } from "viem";
import { celo } from "viem/chains";
import { QUEST_ESCROW_ABI, QUEST_ESCROW_ADDRESS } from "./quest-abi";
import { questMetaFor } from "./quest-meta";
import en, { type Dict } from "./i18n/en";

export type QuestKind = "ONE-SHOT" | "DAILY";

export type QuestCard = {
  id: string;
  /** Human title (EN fallback). Prefer `titleKey` when set for localized copy. */
  title: string;
  /** One-line action (EN fallback). Prefer `actionKey` when set. */
  action: string;
  /** i18n key for the title, set when the target has known metadata. */
  titleKey?: keyof Dict;
  /** i18n key for the action, set when the target has known metadata. */
  actionKey?: keyof Dict;
  /** Decorative glyph for known targets. */
  icon?: string;
  target: `0x${string}`;
  minReward: bigint;
  maxReward: bigint;
  left: bigint;
  deadline: bigint;
  kind: QuestKind;
};

export type QuestListResult = { quests: QuestCard[]; isMock: boolean };

const ZERO = "0x0000000000000000000000000000000000000000";
const CUSD_DECIMALS = 18;

const publicClient = createPublicClient({
  chain: celo,
  transport: http(process.env.NEXT_PUBLIC_CELO_RPC_URL || "https://forno.celo.org"),
});

/** Mock quests for pre-deploy rendering. Amounts in cUSD wei (18 decimals). */
const MOCK_QUESTS: QuestCard[] = [
  {
    id: "1",
    title: "Make your first swap",
    action: "Swap any amount on Mento and come back to claim.",
    target: "0x000000000000000000000000000000000000dEaD",
    minReward: 500000000000000000n, // 0.5
    maxReward: 500000000000000000n, // 0.5
    left: 42n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 14 * 86400),
    kind: "ONE-SHOT",
  },
  {
    id: "2",
    title: "Daily check-in box",
    action: "Send one transaction today, open your mystery box for a variable reward.",
    target: "0x000000000000000000000000000000000000bEEf",
    minReward: 10000000000000000n, // 0.01
    maxReward: 1000000000000000000n, // 1.00
    left: 999n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 30 * 86400),
    kind: "DAILY",
  },
  {
    id: "3",
    title: "Provide liquidity",
    action: "Add liquidity to any Celo pool, then claim your bonus.",
    target: "0x000000000000000000000000000000000000CaFe",
    minReward: 2000000000000000000n, // 2.0
    maxReward: 2000000000000000000n, // 2.0
    left: 8n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400),
    kind: "ONE-SHOT",
  },
];

function kindFromUint(k: number): QuestKind {
  return k === 1 ? "DAILY" : "ONE-SHOT";
}

/**
 * Resolve display copy for a quest from its target's metadata. Known targets
 * get a localized title/action (via i18n keys) plus an EN fallback string;
 * unknown targets keep the generic "Quest #N / interact with the sponsor's app"
 * copy so the UI degrades gracefully.
 */
function copyForTarget(
  id: string,
  target: string,
): Pick<QuestCard, "title" | "action" | "titleKey" | "actionKey" | "icon"> {
  const meta = questMetaFor(target);
  if (!meta) {
    return {
      title: `Quest #${id}`,
      action: "Interact with the sponsor's app, then claim.",
    };
  }
  return {
    title: en[meta.titleKey],
    action: en[meta.actionKey],
    titleKey: meta.titleKey,
    actionKey: meta.actionKey,
    icon: meta.icon,
  };
}

/** Format cUSD wei to a trimmed, fixed-2 (min) display string. */
export function formatCusd(wei: bigint): string {
  const n = Number(formatUnits(wei, CUSD_DECIMALS));
  if (n > 0 && n < 0.01) return "<0.01";
  // Up to 4 sig decimals for sub-dollar, 2 for the rest.
  const decimals = n < 1 ? 4 : 2;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

/** "0.5" or "0.01 – 1.00" reward label. */
export function rewardLabel(min: bigint, max: bigint): string {
  if (min === max) return formatCusd(min);
  return `${formatCusd(min)} – ${formatCusd(max)}`;
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function readAllQuestsOnchain(): Promise<QuestCard[]> {
  const nextId = (await publicClient.readContract({
    address: QUEST_ESCROW_ADDRESS,
    abi: QUEST_ESCROW_ABI,
    functionName: "nextId",
  })) as bigint;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const out: QuestCard[] = [];
  for (let id = nextId - 1n; id >= 1n; id--) {
    const [, target, , minReward, maxReward, left, deadline, kind] =
      (await publicClient.readContract({
        address: QUEST_ESCROW_ADDRESS,
        abi: QUEST_ESCROW_ABI,
        functionName: "quests",
        args: [id],
      })) as readonly [
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
        bigint,
        bigint,
        bigint,
        bigint,
        number,
      ];
    // Hide the test quest whose target is the escrow itself (self-referential,
    // created during E2E testing — not a real quest).
    const isTestQuest = target.toLowerCase() === QUEST_ESCROW_ADDRESS.toLowerCase();
    if (left > 0n && BigInt(deadline) > now && !isTestQuest) {
      out.push({
        id: id.toString(),
        ...copyForTarget(id.toString(), target),
        target,
        minReward,
        maxReward,
        left,
        deadline: BigInt(deadline),
        kind: kindFromUint(kind),
      });
    }
  }
  return out;
}

export async function listQuests(): Promise<QuestListResult> {
  if (QUEST_ESCROW_ADDRESS.toLowerCase() === ZERO) {
    return { quests: MOCK_QUESTS, isMock: true };
  }
  try {
    const quests = await readAllQuestsOnchain();
    return { quests, isMock: false };
  } catch {
    return { quests: MOCK_QUESTS, isMock: true };
  }
}

export async function getQuest(id: string): Promise<{ quest: QuestCard | null; isMock: boolean }> {
  const { quests, isMock } = await listQuests();
  return { quest: quests.find((q) => q.id === id) ?? null, isMock };
}
