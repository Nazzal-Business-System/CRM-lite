import { Suspense } from "react";
import { PERMISSION_KEYS } from "@nbs/shared";
import { PermissionGate } from "@/components/permission-gate";
import { PricingWorkspace } from "@/components/pricing/pricing-workspace";
import { PricingLoading } from "@/components/pricing/pricing-shared";
export default function Page() { return <PermissionGate permission={PERMISSION_KEYS.PRICING_VIEW}><Suspense fallback={<PricingLoading />}><PricingWorkspace /></Suspense></PermissionGate>; }
