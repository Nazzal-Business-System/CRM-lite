import {
  OPPORTUNITY_STAGES,
  QUALIFIED_PLUS_STAGES,
  type CompanySummary,
  type DashboardData,
} from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { decimalToString, endOfDay, startOfDay, userRefSelect } from "../lib/crm";
import { prisma } from "../lib/prisma";
import { listActivities } from "./activities.service";
import { listCompanies } from "./companies.service";

function moneySum(value: Prisma.Decimal | number | null | undefined): string {
  if (value == null) {
    return "0.00";
  }
  if (typeof value === "number") {
    return value.toFixed(2);
  }
  return decimalToString(value) ?? "0.00";
}

export async function getDashboard(): Promise<DashboardData> {
  const todayStart = startOfDay();
  const todayEnd = endOfDay();

  const [
    totalCompanies,
    activeOpportunities,
    qualifiedPlusOpportunities,
    wonCount,
    lostCount,
    overdueFollowUps,
    pipelineGroups,
    activeValueRows,
    overdueTasks,
    dueTodayTasks,
    recentActivityPage,
    priorityCompanyPage,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.opportunity.count({ where: { stage: { notIn: ["WON", "LOST"] } } }),
    prisma.opportunity.count({
      where: { stage: { in: [...QUALIFIED_PLUS_STAGES] } },
    }),
    prisma.opportunity.count({ where: { stage: "WON" } }),
    prisma.opportunity.count({ where: { stage: "LOST" } }),
    prisma.task.count({
      where: { status: "OPEN", dueAt: { lt: todayStart } },
    }),
    prisma.opportunity.groupBy({
      by: ["stage"],
      _count: { _all: true },
      _sum: { estimatedValue: true },
    }),
    prisma.opportunity.findMany({
      where: { stage: { notIn: ["WON", "LOST"] } },
      select: { estimatedValue: true, probability: true },
    }),
    prisma.task.findMany({
      where: { status: "OPEN", dueAt: { lt: todayStart } },
      include: {
        owner: { select: userRefSelect },
        company: { select: { name: true } },
        contact: { select: { name: true } },
        opportunity: { select: { name: true } },
      },
      orderBy: { dueAt: "asc" },
      take: 8,
    }),
    prisma.task.findMany({
      where: { status: "OPEN", dueAt: { gte: todayStart, lte: todayEnd } },
      include: {
        owner: { select: userRefSelect },
        company: { select: { name: true } },
        contact: { select: { name: true } },
        opportunity: { select: { name: true } },
      },
      orderBy: { dueAt: "asc" },
      take: 8,
    }),
    // Sales/customer interactions only (Activity model — not audit/system events)
    listActivities({ page: 1, pageSize: 5, search: "" }),
    // Same derived-priority path as Companies High filter
    listCompanies({
      page: 1,
      pageSize: 8,
      search: "",
      priority: "HIGH",
      sort: "updatedAt",
      order: "desc",
    }),
  ]);

  const highPriorityCompanies = priorityCompanyPage.total;

  let pipelineValue = 0;
  let weightedPipeline = 0;
  for (const row of activeValueRows) {
    const amount = row.estimatedValue ? Number(row.estimatedValue.toString()) : 0;
    pipelineValue += amount;
    weightedPipeline += (amount * row.probability) / 100;
  }

  const grouped = new Map(
    pipelineGroups.map((row) => [
      row.stage,
      {
        count: row._count._all,
        value: moneySum(row._sum.estimatedValue),
      },
    ]),
  );

  const serializeTask = (
    row: (typeof overdueTasks)[number],
  ): DashboardData["overdueTasks"][number] => ({
    id: row.id,
    title: row.title,
    description: row.description,
    dueAt: row.dueAt.toISOString(),
    status: row.status,
    owner: row.owner,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    contactId: row.contactId,
    contactName: row.contact?.name ?? null,
    opportunityId: row.opportunityId,
    opportunityName: row.opportunity?.name ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

  return {
    metrics: {
      totalCompanies,
      highPriorityCompanies,
      activeOpportunities,
      qualifiedPlusOpportunities,
      pipelineValue: pipelineValue.toFixed(2),
      weightedPipeline: weightedPipeline.toFixed(2),
      wonCount,
      lostCount,
      overdueFollowUps,
    },
    pipelineByStage: OPPORTUNITY_STAGES.map((stage) => ({
      stage,
      count: grouped.get(stage)?.count ?? 0,
      value: grouped.get(stage)?.value ?? "0.00",
    })),
    overdueTasks: overdueTasks.map(serializeTask),
    dueTodayTasks: dueTodayTasks.map(serializeTask),
    recentActivities: recentActivityPage.items,
    priorityCompanies: priorityCompanyPage.items as CompanySummary[],
  };
}
