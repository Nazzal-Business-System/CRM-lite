"use client";

import { PERMISSION_KEYS } from "@nbs/shared";
import { OpportunityDetailView } from "@/components/opportunities/opportunities-workspace";
import { PermissionGate } from "@/components/permission-gate";
import { useParams } from "next/navigation";

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <PermissionGate permission={PERMISSION_KEYS.OPPORTUNITIES_VIEW}>
      <OpportunityDetailView id={params.id} />
    </PermissionGate>
  );
}
