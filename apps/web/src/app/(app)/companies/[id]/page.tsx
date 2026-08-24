"use client";

import { PERMISSION_KEYS } from "@nbs/shared";
import { CompanyDetailView } from "@/components/companies/company-detail";
import { PermissionGate } from "@/components/permission-gate";

export default function CompanyDetailPage() {
  return (
    <PermissionGate permission={PERMISSION_KEYS.COMPANIES_VIEW}>
      <CompanyDetailView />
    </PermissionGate>
  );
}
