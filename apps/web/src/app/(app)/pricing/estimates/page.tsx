import { PERMISSION_KEYS } from "@nbs/shared";
import { PermissionGate } from "@/components/permission-gate";
import { SavedEstimates } from "@/components/pricing/saved-estimates";
export default function Page() { return <PermissionGate permission={PERMISSION_KEYS.PRICING_VIEW}><SavedEstimates /></PermissionGate>; }
