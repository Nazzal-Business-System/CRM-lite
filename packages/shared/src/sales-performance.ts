import { z } from "zod";
import type { ActivityType, OpportunityStage } from "./crm";

export const SALES_PERFORMANCE_PERIODS = ["7d", "30d", "90d", "custom"] as const;
export type SalesPerformancePeriod = (typeof SALES_PERFORMANCE_PERIODS)[number];

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine(
  (value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year!, month! - 1, day!));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day;
  },
  "Enter a valid calendar date.",
);

export const salesPerformanceQuerySchema = z.object({
  period: z.enum(SALES_PERFORMANCE_PERIODS).default("30d"),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
}).superRefine((value, ctx) => {
  if (value.period !== "custom") return;
  if (!value.from) ctx.addIssue({ code: "custom", path: ["from"], message: "Start date is required." });
  if (!value.to) ctx.addIssue({ code: "custom", path: ["to"], message: "End date is required." });
  if (!value.from || !value.to) return;
  const from = Date.parse(`${value.from}T00:00:00Z`);
  const to = Date.parse(`${value.to}T00:00:00Z`);
  if (from > to) ctx.addIssue({ code: "custom", path: ["to"], message: "End date must be on or after start date." });
  if (to - from > 366 * 86_400_000) ctx.addIssue({ code: "custom", path: ["to"], message: "Custom ranges cannot exceed 366 days." });
});

export type SalesPerformanceQuery = z.infer<typeof salesPerformanceQuerySchema>;

export interface PerformanceRange { from: string; to: string; period: SalesPerformancePeriod }
export interface PerformanceKpis {
  activities: number; companiesContacted: number; followUpsCompleted: number;
  overdueFollowUps: number; opportunitiesCreated: number; activeOpportunities: number;
  pipelineValue: string; won: number; lost: number; winRate: number | null;
  lastActivityAt: string | null;
}
export interface SalespersonPerformance extends PerformanceKpis {
  salesperson: { id: string; name: string };
  assignedCompanies: number;
}
export interface SalesPerformanceSummary {
  range: PerformanceRange;
  overall: Omit<PerformanceKpis, "activeOpportunities" | "lastActivityAt">;
  salespeople: SalespersonPerformance[];
}
export interface PerformanceActivity {
  id: string; type: ActivityType; occurredAt: string; summary: string; outcome: string | null;
  company: { id: string; name: string };
}
export interface PerformanceCompany {
  id: string; name: string; sector: string | null; priority: "HIGH" | "MEDIUM" | "LOW" | null;
}
export interface PerformanceOpportunity {
  id: string; name: string; company: { id: string; name: string }; stage: OpportunityStage;
  estimatedValue: string | null; closedAt: string | null;
}
export interface PerformanceTask {
  id: string; title: string; dueAt: string; company: { id: string; name: string } | null;
}
export interface ActivityBreakdownItem { type: ActivityType; count: number }
export interface ActivityTrendItem { date: string; count: number }
export interface SalespersonPerformanceDetail {
  range: PerformanceRange; salesperson: { id: string; name: string }; kpis: SalespersonPerformance;
  activityBreakdown: ActivityBreakdownItem[]; activityTrend: ActivityTrendItem[];
  recentActivities: PerformanceActivity[]; assignedCompanies: PerformanceCompany[];
  activeOpportunities: PerformanceOpportunity[]; closedOpportunities: PerformanceOpportunity[];
  overdueFollowUps: PerformanceTask[];
}
