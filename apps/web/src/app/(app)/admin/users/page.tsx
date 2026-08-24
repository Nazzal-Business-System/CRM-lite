"use client";

import { PERMISSION_KEYS } from "@nbs/shared";
import { PermissionGate } from "@/components/permission-gate";
import { UsersManager } from "@/components/users/users-manager";

export default function UsersPage() {
  return (
    <PermissionGate permission={PERMISSION_KEYS.USERS_VIEW}>
      <UsersManager />
    </PermissionGate>
  );
}
