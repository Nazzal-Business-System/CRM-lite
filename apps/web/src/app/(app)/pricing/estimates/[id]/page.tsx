import { PERMISSION_KEYS } from "@nbs/shared";
import { PermissionGate } from "@/components/permission-gate";
import { SavedEstimateDetail } from "@/components/pricing/saved-estimates";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <PermissionGate permission={PERMISSION_KEYS.PRICING_VIEW}><SavedEstimateDetail id={id} /></PermissionGate>; }
