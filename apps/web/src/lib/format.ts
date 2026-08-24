function intlLocale(locale?: string): string {
  return locale === "ar" ? "ar" : "en";
}

export function formatDate(
  value: string | null | undefined,
  locale?: string,
): string {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function formatDateTime(
  value: string | null | undefined,
  locale?: string,
): string {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatMoney(
  value: string | number | null | undefined,
  locale?: string,
): string {
  if (value == null || value === "") {
    return "—";
  }
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) {
    return "—";
  }
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocal(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  return new Date(value).toISOString();
}

export function toDateInput(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

export function fromDateInput(value: string): string | null | undefined {
  if (!value) {
    return null;
  }
  return new Date(`${value}T12:00:00`).toISOString();
}
