import { createContext, useContext, useEffect, useMemo, useState } from "react";
import ar from "./ar.json";
import fr from "./fr.json";

export type Locale = "ar" | "fr";
type Dictionary = Record<string, string>;

const dictionaries: Record<Locale, Dictionary> = { ar, fr };

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  dir: "rtl" | "ltr";
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem("fg_locale");
    return stored === "fr" ? "fr" : "ar";
  });

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    localStorage.setItem("fg_locale", locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      t: (key: string) => dictionaries[locale][key] ?? dictionaries.ar[key] ?? key,
      dir: locale === "ar" ? "rtl" : "ltr"
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
