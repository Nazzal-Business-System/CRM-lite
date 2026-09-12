import { computeWeightedValue } from "@nbs/shared";
import { toIso } from "./serialize";

type DecimalLike = { toFixed(digits: number): string };

export const userRefSelect = {
  id: true,
  name: true,
} as const;

export function decimalToString(value: DecimalLike | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  return value.toFixed(2);
}

export function weightedFrom(
  estimatedValue: DecimalLike | null | undefined,
  probability: number,
): string | null {
  return computeWeightedValue(decimalToString(estimatedValue), probability);
}

export function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value == null || value === "") {
    return null;
  }
  return new Date(value);
}

export function startOfDay(date = new Date()): Date {
  const parts = jordanDateParts(date);
  return jordanWallTime(parts.year, parts.month, parts.day);
}

export function endOfDay(date = new Date()): Date {
  const parts = jordanDateParts(date);
  const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return new Date(
    jordanWallTime(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
    ).getTime() - 1,
  );
}

function jordanDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Amman",
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
    year: value("year"), month: value("month"), day: value("day"),
    hour: value("hour"), minute: value("minute"), second: value("second"),
  };
}

function jordanWallTime(year: number, month: number, day: number): Date {
  const target = Date.UTC(year, month - 1, day);
  let instant = target;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rendered = jordanDateParts(new Date(instant));
    instant = target - (Date.UTC(
      rendered.year, rendered.month - 1, rendered.day,
      rendered.hour, rendered.minute, rendered.second,
    ) - instant);
  }
  return new Date(instant);
}

export function isoOrNull(value: Date | null | undefined): string | null {
  return toIso(value ?? null);
}

export function skipTake(page: number, pageSize: number): { skip: number; take: number } {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}
