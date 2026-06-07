"use client";
// Fixed bottom tab bar (mobile-first). Present on every page via the root layout.
// Active tab in gold with a sliding indicator pill behind the icon. Inline SVG
// icons (no icon lib). Quest detail (/quest/[id]) keeps "Quests" active.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useT } from "./i18n";
import type { Dict } from "@/lib/i18n/en";
import styles from "./BottomNav.module.css";

type Tab = {
  href: string;
  labelKey: keyof Dict;
  /** Active when the pathname starts with this (segment-aware). */
  match: (p: string) => boolean;
  icon: (active: boolean) => ReactNode;
};

const TABS: Tab[] = [
  {
    href: "/",
    labelKey: "nav.quests",
    match: (p) => p === "/" || p.startsWith("/quest"),
    icon: (a) => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
        <path
          d="M12 3 20 7.4v9.2L12 21l-8-4.4V7.4L12 3Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        {a && <path d="M12 8.2 16 10.4v4.4L12 17l-4-2.2v-4.4L12 8.2Z" fill="currentColor" />}
      </svg>
    ),
  },
  {
    href: "/history",
    labelKey: "nav.history",
    match: (p) => p.startsWith("/history"),
    icon: (a) => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M12 7.5V12l3 2"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {a && <circle cx="12" cy="12" r="1.6" fill="currentColor" />}
      </svg>
    ),
  },
  {
    href: "/sponsor",
    labelKey: "nav.create",
    match: (p) => p.startsWith("/sponsor"),
    icon: (a) => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.7" fill={a ? "currentColor" : "none"} />
        <path
          d="M12 8.5v7M8.5 12h7"
          stroke={a ? "var(--bg)" : "currentColor"}
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/settings",
    labelKey: "nav.settings",
    match: (p) => p.startsWith("/settings"),
    icon: (a) => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" fill={a ? "currentColor" : "none"} />
        <path
          d="M19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname() || "/";
  const t = useT();
  return (
    <nav className={styles.nav} aria-label="Primary">
      <ul className={styles.list}>
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`${styles.tab} ${active ? styles.active : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.iconWrap}>
                  {active && <span className={styles.glow} aria-hidden />}
                  {tab.icon(active)}
                </span>
                <span className={styles.label}>{t(tab.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
