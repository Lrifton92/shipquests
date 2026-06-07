"use client";
// Lightweight i18n: a React Context + useT() hook. No external deps.
// EN is the source of truth (all keys); other locales are merged over EN so a
// missing key falls back to English. Language is persisted in localStorage and
// defaults to navigator.language, else EN.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en, { type Dict } from "@/lib/i18n/en";
import fr from "@/lib/i18n/fr";
import es from "@/lib/i18n/es";
import pt from "@/lib/i18n/pt";

export const LANGS = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
] as const;

export type Lang = (typeof LANGS)[number]["code"];

const DICTS: Record<Lang, Partial<Dict>> = { en, fr, es, pt };
const STORAGE_KEY = "shipquests-lang";

function isLang(v: string): v is Lang {
  return LANGS.some((l) => l.code === v);
}

function detectLang(): Lang {
  if (typeof navigator === "undefined") return "en";
  const nav = navigator.language?.slice(0, 2).toLowerCase() ?? "";
  return isLang(nav) ? nav : "en";
}

type TVars = Record<string, string | number>;
type TFn = (key: keyof Dict, vars?: TVars) => string;

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: TFn };
const LanguageContext = createContext<Ctx | null>(null);

function interpolate(tpl: string, vars?: TVars): string {
  if (!vars) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m,
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always start at EN on the server/first paint to keep SSR + first client
  // render identical; sync to the stored/detected language after mount.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    setLangState(stored && isLang(stored) ? stored : detectLang());
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable — language stays for this session only */
    }
  };

  const t = useMemo<TFn>(() => {
    const dict = DICTS[lang];
    return (key, vars) => interpolate(dict[key] ?? en[key], vars);
  }, [lang]);

  const value = useMemo<Ctx>(() => ({ lang, setLang, t }), [lang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT(): TFn {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT must be used within LanguageProvider");
  return ctx.t;
}

export function useLang(): { lang: Lang; setLang: (l: Lang) => void } {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return { lang: ctx.lang, setLang: ctx.setLang };
}
