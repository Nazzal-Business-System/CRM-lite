function intlLocale(locale?: string): string {
  return locale === "ar" ? "ar" : "en";
}

export const BUSINESS_TIME_ZONE = "Asia/Amman";

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(date: Date, timeZone = BUSINESS_TIME_ZONE): DateTimeParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

/** Convert a Jordan business wall-clock time to its canonical UTC instant. */
export function jordanDateTimeToUtc(value: DateTimeParts): string {
  const wallClockAsUtc = Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
  );
  let instant = wallClockAsUtc;
  // Resolve the IANA-zone offset explicitly (and safely if its rules change).
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const atInstant = zonedParts(new Date(instant));
    const renderedAsUtc = Date.UTC(
      atInstant.year,
      atInstant.month - 1,
      atInstant.day,
      atInstant.hour,
      atInstant.minute,
      atInstant.second,
    );
    instant = wallClockAsUtc - (renderedAsUtc - instant);
  }
  return new Date(instant).toISOString();
}

export function jordanParts(value: string | Date): DateTimeParts | undefined {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : zonedParts(date);
}

export function jordanDateKey(value: string | Date): string | undefined {
  const parts = jordanParts(value);
  if (!parts) return undefined;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function formatDate(
  value: string | null | undefined,
  locale?: string,
): string {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: BUSINESS_TIME_ZONE }).format(
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
    timeZone: BUSINESS_TIME_ZONE,
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
  const date = jordanParts(value);
  if (!date) {
    return "";
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.year}-${pad(date.month)}-${pad(date.day)}T${pad(date.hour)}:${pad(date.minute)}`;
}

export function fromDateTimeLocal(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }
  return jordanDateTimeToUtc({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: 0,
  });
}

export function toDateInput(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const date = jordanParts(value);
  if (!date) {
    return "";
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

export function fromDateInput(value: string): string | null | undefined {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  return jordanDateTimeToUtc({ year: year!, month: month!, day: day!, hour: 12, minute: 0, second: 0 });
}
