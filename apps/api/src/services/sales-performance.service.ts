import {
  ACTIVITY_TYPES,
  OPEN_OPPORTUNITY_STAGES,
  SYSTEM_ROLE_NAMES,
  type ActivityType,
  type SalesPerformanceQuery,
  type SalesPerformanceSummary,
  type SalespersonPerformance,
  type SalespersonPerformanceDetail,
} from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { decimalToString } from "../lib/crm";
import { notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { CONTACT_ACTIVITY_TYPES, resolvePerformancePeriod, winRate } from "./sales-performance-metrics";

type CountRow = { ownerId: string | null; _count: { _all: number } };
type ClosedRow = CountRow & { stage: "WON" | "LOST" };

function countMap(rows: CountRow[]): Map<string, number> {
  return new Map(rows.filter((row) => row.ownerId).map((row) => [row.ownerId!, row._count._all]));
}

function overallCount(rows: CountRow[]): number {
  return rows.reduce((sum, row) => sum + row._count._all, 0);
}

export async function getSalesPerformance(query: SalesPerformanceQuery): Promise<SalesPerformanceSummary> {
  const now = new Date();
  const range = resolvePerformancePeriod(query, now);
  const occurredAt = { gte: range.from, lte: range.to };
  const closedAt = { gte: range.from, lte: range.to };
  const createdAt = { gte: range.from, lte: range.to };
  const dueAt = { gte: range.from, lte: new Date(Math.min(range.to.getTime(), now.getTime() - 1)) };

  const [users, activities, contactedPairs, completed, overdue, created, active, closed, assigned, lastActivities] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: { name: SYSTEM_ROLE_NAMES.SALES } },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    }),
    prisma.activity.groupBy({ by: ["ownerId"], where: { occurredAt }, _count: { _all: true } }),
    prisma.activity.groupBy({
      by: ["ownerId", "companyId"],
      where: { occurredAt, type: { in: [...CONTACT_ACTIVITY_TYPES] } },
      _count: { _all: true },
    }),
    prisma.task.groupBy({ by: ["ownerId"], where: { status: "COMPLETED", completedAt: occurredAt }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ["ownerId"], where: { status: "OPEN", dueAt }, _count: { _all: true } }),
    prisma.opportunity.groupBy({ by: ["ownerId"], where: { createdAt }, _count: { _all: true } }),
    prisma.opportunity.groupBy({
      by: ["ownerId"], where: { stage: { in: [...OPEN_OPPORTUNITY_STAGES] } },
      _count: { _all: true }, _sum: { estimatedValue: true },
    }),
    prisma.opportunity.groupBy({
      by: ["ownerId", "stage"], where: { stage: { in: ["WON", "LOST"] }, closedAt }, _count: { _all: true },
    }),
    prisma.company.groupBy({ by: ["ownerId"], where: { ownerId: { not: null } }, _count: { _all: true } }),
    prisma.activity.groupBy({ by: ["ownerId"], _max: { occurredAt: true } }),
  ]);

  const activityCounts = countMap(activities);
  const completedCounts = countMap(completed);
  const overdueCounts = countMap(overdue);
  const createdCounts = countMap(created);
  const activeCounts = countMap(active);
  const assignedCounts = countMap(assigned);
  const lastMap = new Map(lastActivities.map((row) => [row.ownerId, row._max.occurredAt]));
  const contactedByOwner = new Map<string, Set<string>>();
  for (const row of contactedPairs) {
    const set = contactedByOwner.get(row.ownerId) ?? new Set<string>();
    set.add(row.companyId);
    contactedByOwner.set(row.ownerId, set);
  }
  const wonByOwner = new Map<string, number>();
  const lostByOwner = new Map<string, number>();
  for (const row of closed as ClosedRow[]) {
    if (!row.ownerId) continue;
    (row.stage === "WON" ? wonByOwner : lostByOwner).set(row.ownerId, row._count._all);
  }
  const pipelineByOwner = new Map(active.filter((row) => row.ownerId).map((row) => [row.ownerId!, row._sum.estimatedValue?.toFixed(2) ?? "0.00"]));

  const salespeople: SalespersonPerformance[] = users.map((user) => {
    const won = wonByOwner.get(user.id) ?? 0;
    const lost = lostByOwner.get(user.id) ?? 0;
    return {
      salesperson: user,
      assignedCompanies: assignedCounts.get(user.id) ?? 0,
      activities: activityCounts.get(user.id) ?? 0,
      companiesContacted: contactedByOwner.get(user.id)?.size ?? 0,
      followUpsCompleted: completedCounts.get(user.id) ?? 0,
      overdueFollowUps: overdueCounts.get(user.id) ?? 0,
      opportunitiesCreated: createdCounts.get(user.id) ?? 0,
      activeOpportunities: activeCounts.get(user.id) ?? 0,
      pipelineValue: pipelineByOwner.get(user.id) ?? "0.00",
      won, lost, winRate: winRate(won, lost),
      lastActivityAt: lastMap.get(user.id)?.toISOString() ?? null,
    };
  });

  const overallWon = (closed as ClosedRow[]).filter((row) => row.stage === "WON").reduce((sum, row) => sum + row._count._all, 0);
  const overallLost = (closed as ClosedRow[]).filter((row) => row.stage === "LOST").reduce((sum, row) => sum + row._count._all, 0);
  const overallPipeline = active.reduce((sum, row) => sum + Number(row._sum.estimatedValue?.toString() ?? 0), 0).toFixed(2);

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), period: range.period },
    overall: {
      activities: overallCount(activities),
      companiesContacted: new Set(contactedPairs.map((row) => row.companyId)).size,
      followUpsCompleted: overallCount(completed), overdueFollowUps: overallCount(overdue),
      opportunitiesCreated: overallCount(created), pipelineValue: overallPipeline,
      won: overallWon, lost: overallLost, winRate: winRate(overallWon, overallLost),
    },
    salespeople,
  };
}

export async function getSalespersonPerformance(userId: string, query: SalesPerformanceQuery): Promise<SalespersonPerformanceDetail> {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true, role: { name: SYSTEM_ROLE_NAMES.SALES } },
    select: { id: true, name: true },
  });
  if (!user) throw notFound("Active sales user not found.");

  const summary = await getSalesPerformance(query);
  const kpis = summary.salespeople.find((row) => row.salesperson.id === userId);
  if (!kpis) throw notFound("Sales performance was not found.");
  const range = resolvePerformancePeriod(query);
  const activityWhere = { ownerId: userId, occurredAt: { gte: range.from, lte: range.to } };
  const now = new Date();

  const [breakdown, recentActivities, assignedCompanies, activeOpportunities, closedOpportunities, overdueFollowUps, trend] = await Promise.all([
    prisma.activity.groupBy({ by: ["type"], where: activityWhere, _count: { _all: true } }),
    prisma.activity.findMany({ where: activityWhere, select: { id: true, type: true, occurredAt: true, summary: true, outcome: true, company: { select: { id: true, name: true } } }, orderBy: { occurredAt: "desc" }, take: 12 }),
    prisma.company.findMany({ where: { ownerId: userId }, select: { id: true, name: true, sector: true, priority: true }, orderBy: { name: "asc" } }),
    prisma.opportunity.findMany({ where: { ownerId: userId, stage: { in: [...OPEN_OPPORTUNITY_STAGES] } }, select: { id: true, name: true, stage: true, estimatedValue: true, closedAt: true, company: { select: { id: true, name: true } } }, orderBy: { updatedAt: "desc" } }),
    prisma.opportunity.findMany({ where: { ownerId: userId, stage: { in: ["WON", "LOST"] }, closedAt: { gte: range.from, lte: range.to } }, select: { id: true, name: true, stage: true, estimatedValue: true, closedAt: true, company: { select: { id: true, name: true } } }, orderBy: { closedAt: "desc" } }),
    prisma.task.findMany({ where: { ownerId: userId, status: "OPEN", dueAt: { gte: range.from, lte: new Date(Math.min(range.to.getTime(), now.getTime() - 1)) } }, select: { id: true, title: true, dueAt: true, company: { select: { id: true, name: true } } }, orderBy: { dueAt: "asc" } }),
    prisma.$queryRaw<Array<{ date: string; count: number }>>(Prisma.sql`
      SELECT TO_CHAR(("occurredAt" AT TIME ZONE 'Asia/Amman')::date, 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS count
      FROM activities
      WHERE "ownerId" = ${userId} AND "occurredAt" >= ${range.from} AND "occurredAt" <= ${range.to}
      GROUP BY 1 ORDER BY 1
    `),
  ]);

  const serializeOpportunity = (row: (typeof activeOpportunities)[number]) => ({ ...row, estimatedValue: decimalToString(row.estimatedValue), closedAt: row.closedAt?.toISOString() ?? null });
  return {
    range: summary.range, salesperson: user, kpis,
    activityBreakdown: ACTIVITY_TYPES.map((type) => ({ type: type as ActivityType, count: breakdown.find((row) => row.type === type)?._count._all ?? 0 })),
    activityTrend: trend,
    recentActivities: recentActivities.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() })),
    assignedCompanies,
    activeOpportunities: activeOpportunities.map(serializeOpportunity),
    closedOpportunities: closedOpportunities.map(serializeOpportunity),
    overdueFollowUps: overdueFollowUps.map((row) => ({ ...row, dueAt: row.dueAt.toISOString() })),
  };
}
