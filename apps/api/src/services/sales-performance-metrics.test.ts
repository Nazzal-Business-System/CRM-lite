import assert from "node:assert/strict";
import test from "node:test";
import { salesPerformanceQuerySchema } from "@nbs/shared";
import { isInRange, isOverdueInRange, resolvePerformancePeriod, sumMoney, uniqueContactedCompanies, winRate } from "./sales-performance-metrics";

test("preset date filtering covers the requested inclusive business days", () => {
  const now = new Date("2026-09-27T09:00:00.000Z");
  const range = resolvePerformancePeriod({ period: "7d" }, now);
  assert.equal(range.from.toISOString(), "2026-09-20T21:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-09-27T20:59:59.999Z");
  assert.equal(isInRange(new Date("2026-09-21T00:00:00.000Z"), range), true);
  assert.equal(isInRange(new Date("2026-09-20T20:59:59.999Z"), range), false);
});

test("custom ranges reject reversed, missing, invalid, and excessive dates", () => {
  assert.equal(salesPerformanceQuerySchema.safeParse({ period: "custom", from: "2026-09-20", to: "2026-09-01" }).success, false);
  assert.equal(salesPerformanceQuerySchema.safeParse({ period: "custom", from: "2026-02-30", to: "2026-03-01" }).success, false);
  assert.equal(salesPerformanceQuerySchema.safeParse({ period: "custom", from: "2025-01-01", to: "2026-09-01" }).success, false);
  assert.equal(salesPerformanceQuerySchema.safeParse({ period: "custom" }).success, false);
});

test("contacted companies are unique even across repeat activity", () => {
  assert.equal(uniqueContactedCompanies([{ companyId: "a" }, { companyId: "a" }, { companyId: "b" }]), 2);
});

test("win rate uses only won plus lost and returns null with no outcomes", () => {
  assert.equal(winRate(3, 1), 75);
  assert.equal(winRate(0, 0), null);
});

test("pipeline totals use existing monetary values and treat null as zero", () => {
  assert.equal(sumMoney([{ estimatedValue: { toString: () => "125.50" } }, { estimatedValue: null }, { estimatedValue: { toString: () => "74.50" } }]), "200.00");
});

test("overdue requires an open task due before now and inside the selected range", () => {
  const range = { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-09-30T23:59:59Z") };
  const now = new Date("2026-09-27T12:00:00Z");
  assert.equal(isOverdueInRange({ status: "OPEN", dueAt: new Date("2026-09-20T12:00:00Z") }, range, now), true);
  assert.equal(isOverdueInRange({ status: "COMPLETED", dueAt: new Date("2026-09-20T12:00:00Z") }, range, now), false);
  assert.equal(isOverdueInRange({ status: "OPEN", dueAt: new Date("2026-09-28T12:00:00Z") }, range, now), false);
  assert.equal(isOverdueInRange({ status: "OPEN", dueAt: new Date("2026-08-20T12:00:00Z") }, range, now), false);
});
