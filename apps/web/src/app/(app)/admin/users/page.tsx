import { PERMISSION_KEYS } from "@nbs/shared";
import { PermissionGate } from "@/components/permission-gate";
import { UsersManager } from "@/components/users/users-manager";
import type { PartnerEditorTarget } from "@/lib/partners";
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ create?: string; edit?: string }> }) {
  const params = await searchParams;
  const initialEditor: PartnerEditorTarget | null = typeof params.edit === "string" && params.edit ? { mode: "edit", id: params.edit } : params.create === "partner" || params.create === "internal" ? { mode: "create", internal: params.create === "internal" } : null;
  return <PermissionGate permission={PERMISSION_KEYS.USERS_VIEW}><UsersManager key={JSON.stringify(initialEditor)} initialEditor={initialEditor} /></PermissionGate>;
}
