import { PERMISSION_KEYS } from "@nbs/shared";
import { PermissionGate } from "@/components/permission-gate";
import { SalespersonPerformanceView } from "@/components/sales-performance/sales-performance-workspace";

export default async function Page({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const { userId } = await params;
  const filters = await searchParams;
  const period = (["7d", "30d", "90d", "custom"] as const).find((value) => value === filters.period) ?? "30d";
  return <PermissionGate permission={PERMISSION_KEYS.SALES_PERFORMANCE_VIEW}><SalespersonPerformanceView userId={userId} initialPeriod={period} initialFrom={filters.from} initialTo={filters.to} /></PermissionGate>;
}
