import { PERMISSION_KEYS } from "@nbs/shared";
import { PermissionGate } from "@/components/permission-gate";
import { DemosWorkspace } from "@/components/demos/demos-workspace";
export default function Page() { return <PermissionGate permission={PERMISSION_KEYS.DEMOS_VIEW}><DemosWorkspace /></PermissionGate>; }
