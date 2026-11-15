import { PERMISSION_KEYS } from "@nbs/shared";
import { PermissionGate } from "@/components/permission-gate";
import { SessionsWorkspace } from "@/components/sessions/sessions-workspace";

export default function Page() { return <PermissionGate permission={PERMISSION_KEYS.SESSIONS_VIEW}><SessionsWorkspace admin /></PermissionGate>; }
