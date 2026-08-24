export type AppLocale = "en" | "ar";

export const LOCALE_STORAGE_KEY = "nbs-crm-locale";

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  ar: "العربية",
};

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === "en" || value === "ar";
}

export function localeDirection(locale: AppLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

type Dict = { [key: string]: string | Dict };

function getPath(messages: Dict, path: string): string | undefined {
  const parts = path.split(".");
  let current: string | Dict | undefined = messages;
  for (const part of parts) {
    if (current == null || typeof current === "string") {
      return undefined;
    }
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function translate(
  messages: Dict,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let value = getPath(messages, key) ?? key;
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return value;
}

export type { Dict as MessageDict };
