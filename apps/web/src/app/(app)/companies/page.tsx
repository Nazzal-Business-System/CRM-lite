"use client";

import { PERMISSION_KEYS } from "@nbs/shared";
import { CompaniesWorkspace } from "@/components/companies/companies-workspace";
import { PermissionGate } from "@/components/permission-gate";

export default function CompaniesPage() {
  return (
    <PermissionGate permission={PERMISSION_KEYS.COMPANIES_VIEW}>
      <CompaniesWorkspace />
    </PermissionGate>
  );
}
