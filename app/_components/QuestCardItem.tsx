"use client";
// A single quest card in the list. Links to the detail/claim page.
import Link from "next/link";
import { rewardLabel, type QuestCard } from "@/lib/quest-list";
import styles from "./QuestCardItem.module.css";

function daysLeft(deadline: bigint): number {
  const secs = Number(deadline) - Math.floor(Date.now() / 1000);
  return Math.max(0, Math.ceil(secs / 86400));
}

export function QuestCardItem({ quest }: { quest: QuestCard }) {
  const isDaily = quest.kind === "DAILY";
  const days = daysLeft(quest.deadline);
  return (
    <Link href={`/quest/${quest.id}`} className={styles.card} data-kind={quest.kind}>
      <div className={styles.top}>
        <span className={`${styles.badge} ${isDaily ? styles.daily : styles.oneshot}`}>
          {isDaily ? "DAILY BOX" : "ONE-SHOT"}
        </span>
        <span className={styles.days}>{days}d left</span>
      </div>

      <h3 className={styles.title}>{quest.title}</h3>
      <p className={styles.action}>{quest.action}</p>

      <div className={styles.foot}>
        <div className={styles.reward}>
          <span className={`${styles.amount} mono`}>{rewardLabel(quest.minReward, quest.maxReward)}</span>
          <span className={styles.unit}>cUSD</span>
        </div>
        <span className={`${styles.left} mono`}>{quest.left.toString()} left</span>
      </div>
    </Link>
  );
}
