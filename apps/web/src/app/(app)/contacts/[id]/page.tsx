"use client";

import { PERMISSION_KEYS } from "@nbs/shared";
import { ContactDetailView } from "@/components/contacts/contacts-workspace";
import { PermissionGate } from "@/components/permission-gate";
import { useParams } from "next/navigation";

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <PermissionGate permission={PERMISSION_KEYS.CONTACTS_VIEW}>
      <ContactDetailView id={params.id} />
    </PermissionGate>
  );
}
