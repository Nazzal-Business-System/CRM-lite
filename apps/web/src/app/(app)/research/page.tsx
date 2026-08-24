"use client";

import { PERMISSION_KEYS } from "@nbs/shared";
import { PermissionGate } from "@/components/permission-gate";
import { ResearchWorkspace } from "@/components/research/research-workspace";

export default function ResearchPage() {
  return (
    <PermissionGate permission={PERMISSION_KEYS.COMPANIES_VIEW}>
      <ResearchWorkspace />
    </PermissionGate>
  );
}
