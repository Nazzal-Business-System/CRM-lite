"use client";

import { PERMISSION_KEYS } from "@nbs/shared";
import { ActivitiesWorkspace } from "@/components/activities/activities-workspace";
import { PermissionGate } from "@/components/permission-gate";

export default function ActivitiesPage() {
  return (
    <PermissionGate permission={PERMISSION_KEYS.ACTIVITIES_VIEW}>
      <ActivitiesWorkspace />
    </PermissionGate>
  );
}
