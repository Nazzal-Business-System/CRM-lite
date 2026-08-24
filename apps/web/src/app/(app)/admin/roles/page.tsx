"use client";

import { PERMISSION_KEYS } from "@nbs/shared";
import { PermissionGate } from "@/components/permission-gate";
import { RolesManager } from "@/components/roles/roles-manager";

export default function RolesPage() {
  return (
    <PermissionGate permission={PERMISSION_KEYS.ROLES_VIEW}>
      <RolesManager />
    </PermissionGate>
  );
}
