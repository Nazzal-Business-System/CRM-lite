import { PERMISSION_KEYS } from "@nbs/shared";
import { PermissionGate } from "@/components/permission-gate";
import { SalesPerformanceWorkspace } from "@/components/sales-performance/sales-performance-workspace";

export default function Page() {
  return <PermissionGate permission={PERMISSION_KEYS.SALES_PERFORMANCE_VIEW}><SalesPerformanceWorkspace /></PermissionGate>;
}
