import { PERMISSION_KEYS } from "@nbs/shared";
import { AuditLogsPage } from "@/components/audit/audit-logs-page";
import { PermissionGate } from "@/components/permission-gate";

export default function Page() {
  return (
    <PermissionGate permission={PERMISSION_KEYS.AUDIT_LOGS_VIEW}>
      <AuditLogsPage />
    </PermissionGate>
  );
}
