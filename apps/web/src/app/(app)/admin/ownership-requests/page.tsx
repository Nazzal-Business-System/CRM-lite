import { PERMISSION_KEYS } from "@nbs/shared";
import { OwnershipRequestsPage } from "@/components/ownership/ownership-requests-page";
import { PermissionGate } from "@/components/permission-gate";

export default function Page() {
  return (
    <PermissionGate permission={PERMISSION_KEYS.OWNERSHIP_REQUESTS_VIEW}>
      <OwnershipRequestsPage />
    </PermissionGate>
  );
}
