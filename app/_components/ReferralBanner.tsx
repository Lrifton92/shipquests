"use client";
// Global, discreet "you were invited" banner. Mounted once in Providers so it
// also drives the referral capture/link side-effect (useReferralCapture) for the
// whole app. Shows only when a valid ?ref was captured and the user hasn't
// dismissed it this session. Renders nothing otherwise.
import { useState } from "react";
import { useReferralCapture } from "./useReferralCapture";
import { useT } from "./i18n";
import styles from "./ReferralBanner.module.css";

const DISMISS_KEY = "shipquests-ref-banner-dismissed";

export function ReferralBanner() {
  const { wasReferred } = useReferralCapture();
  const t = useT();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (!wasReferred || dismissed) return null;

  const close = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={styles.banner} role="status">
      <span className={styles.dot} aria-hidden />
      <span className={styles.text}>{t("referral.banner")}</span>
      <button type="button" className={styles.close} onClick={close} aria-label={t("referral.banner.dismiss")}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
