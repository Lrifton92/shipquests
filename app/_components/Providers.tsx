"use client";
// Client boundary that wraps the whole app with context providers. Mounted in
// the (server) root layout so children stay server components by default.
import type { ReactNode } from "react";
import { LanguageProvider } from "./i18n";

export function Providers({ children }: { children: ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
