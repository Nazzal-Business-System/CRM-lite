"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  isAppLocale,
  localeDirection,
  LOCALE_STORAGE_KEY,
  translate,
  type AppLocale,
} from "@/i18n/config";
import { arMessages, enMessages, type Messages } from "@/i18n/messages";

const catalogs: Record<AppLocale, Messages> = {
  en: enMessages,
  ar: arMessages,
};

type I18nContextValue = {
  locale: AppLocale;
  dir: "ltr" | "rtl";
  setLocale: (locale: AppLocale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): AppLocale {
  if (typeof window === "undefined") {
    return "en";
  }
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (isAppLocale(stored)) {
    return stored;
  }
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${LOCALE_STORAGE_KEY}=`))
    ?.split("=")[1];
  return isAppLocale(cookie) ? cookie : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(readStoredLocale);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    document.cookie = `${LOCALE_STORAGE_KEY}=${next};path=/;max-age=31536000;samesite=lax`;
  }, []);

  useEffect(() => {
    const dir = localeDirection(locale);
    document.documentElement.lang = locale === "ar" ? "ar" : "en";
    document.documentElement.dir = dir;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const messages = catalogs[locale];
    return {
      locale,
      dir: localeDirection(locale),
      setLocale,
      t: (key, vars) => translate(messages, key, vars),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
