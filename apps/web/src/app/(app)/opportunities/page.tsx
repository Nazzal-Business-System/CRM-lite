"use client";

import { PERMISSION_KEYS } from "@nbs/shared";
import { OpportunitiesWorkspace } from "@/components/opportunities/opportunities-workspace";
import { PermissionGate } from "@/components/permission-gate";

export default function OpportunitiesPage() {
  return (
    <PermissionGate permission={PERMISSION_KEYS.OPPORTUNITIES_VIEW}>
      <OpportunitiesWorkspace />
    </PermissionGate>
  );
}
