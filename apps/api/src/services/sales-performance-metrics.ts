import type { SalesPerformancePeriod, SalesPerformanceQuery } from "@nbs/shared";
import { endOfDay, startOfDay } from "../lib/crm";

export const CONTACT_ACTIVITY_TYPES = ["CALL", "EMAIL", "LINKEDIN", "WHATSAPP", "MEETING", "FOLLOW_UP"] as const;

function dateFromDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!, 12));
}

export function resolvePerformancePeriod(query: SalesPerformanceQuery, now = new Date()) {
  if (query.period === "custom") {
    return {
      from: startOfDay(dateFromDateOnly(query.from!)),
      to: endOfDay(dateFromDateOnly(query.to!)),
      period: query.period,
    };
  }
  const days = Number.parseInt(query.period, 10);
  const today = startOfDay(now);
  return {
    from: new Date(today.getTime() - (days - 1) * 86_400_000),
    to: endOfDay(now),
    period: query.period as SalesPerformancePeriod,
  };
}

export function winRate(won: number, lost: number): number | null {
  const decided = won + lost;
  return decided === 0 ? null : Number(((won / decided) * 100).toFixed(1));
}

export function sumMoney(values: Array<{ estimatedValue: { toString(): string } | null | undefined }>): string {
  return values.reduce((sum, row) => sum + Number(row.estimatedValue?.toString() ?? 0), 0).toFixed(2);
}

export function uniqueContactedCompanies(rows: Array<{ companyId: string }>): number {
  return new Set(rows.map((row) => row.companyId)).size;
}

export function isOverdueInRange(
  task: { status: string; dueAt: Date },
  range: { from: Date; to: Date },
  now = new Date(),
): boolean {
  return task.status === "OPEN" && task.dueAt >= range.from && task.dueAt <= range.to && task.dueAt < now;
}

export function isInRange(value: Date, range: { from: Date; to: Date }): boolean {
  return value >= range.from && value <= range.to;
}
