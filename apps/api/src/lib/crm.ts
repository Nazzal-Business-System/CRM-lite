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
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function endOfDay(date = new Date()): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
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
