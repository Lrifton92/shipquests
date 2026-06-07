"use client";
// A single quest card in the list. Links to the detail/claim page.
// 3D pointer tilt (CSS-transform only) via useTilt — disabled on touch and under
// prefers-reduced-motion. The Link is the tilting element inside a perspective wrap.
import Link from "next/link";
import { rewardLabel, type QuestCard } from "@/lib/quest-list";
import { useTilt } from "./useTilt";
import { useT } from "./i18n";
import styles from "./QuestCardItem.module.css";

function daysLeft(deadline: bigint): number {
  const secs = Number(deadline) - Math.floor(Date.now() / 1000);
  return Math.max(0, Math.ceil(secs / 86400));
}

export function QuestCardItem({ quest }: { quest: QuestCard }) {
  const isDaily = quest.kind === "DAILY";
  const days = daysLeft(quest.deadline);
  const tilt = useTilt<HTMLAnchorElement>();
  const t = useT();
  return (
    <div className={styles.persp}>
    <Link
      ref={tilt.ref}
      href={`/quest/${quest.id}`}
      className={styles.card}
      data-kind={quest.kind}
      style={tilt.style}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onPointerUp={tilt.onPointerUp}
    >
      <div className={styles.top}>
        <span className={`${styles.badge} ${isDaily ? styles.daily : styles.oneshot}`}>
          {isDaily ? t("card.daily") : t("card.oneshot")}
        </span>
        <span className={styles.days}>{t("card.daysLeft", { n: days })}</span>
      </div>

      <h3 className={styles.title}>
        {quest.icon && <span aria-hidden>{quest.icon} </span>}
        {quest.titleKey ? t(quest.titleKey) : quest.title}
      </h3>
      <p className={styles.action}>{quest.actionKey ? t(quest.actionKey) : quest.action}</p>

      <div className={styles.foot}>
        <div className={styles.reward}>
          <span className={`${styles.amount} mono`}>{rewardLabel(quest.minReward, quest.maxReward)}</span>
          <span className={styles.unit}>cUSD</span>
        </div>
        <span className={`${styles.left} mono`}>{t("card.left", { n: quest.left.toString() })}</span>
      </div>
    </Link>
    </div>
  );
}
