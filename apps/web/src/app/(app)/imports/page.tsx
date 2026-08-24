"use client";

import { PERMISSION_KEYS } from "@nbs/shared";
import { ImportsWorkspace } from "@/components/imports/imports-workspace";
import { PermissionGate } from "@/components/permission-gate";

export default function ImportsPage() {
  return (
    <PermissionGate permission={PERMISSION_KEYS.IMPORTS_VIEW}>
      <ImportsWorkspace />
    </PermissionGate>
  );
}
