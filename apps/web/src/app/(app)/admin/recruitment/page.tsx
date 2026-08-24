"use client";

import { PERMISSION_KEYS } from "@nbs/shared";
import { PermissionGate } from "@/components/permission-gate";
import { RecruitmentWorkspace } from "@/components/recruitment/recruitment-workspace";

export default function RecruitmentPage() {
  return (
    <PermissionGate permission={PERMISSION_KEYS.RECRUITMENT_VIEW}>
      <RecruitmentWorkspace />
    </PermissionGate>
  );
}
