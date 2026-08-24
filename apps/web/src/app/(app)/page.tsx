"use client";

import { PERMISSION_KEYS } from "@nbs/shared";
import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { PermissionGate } from "@/components/permission-gate";

export default function DashboardPage() {
  return (
    <PermissionGate permission={PERMISSION_KEYS.DASHBOARD_VIEW}>
      <DashboardWorkspace />
    </PermissionGate>
  );
}
