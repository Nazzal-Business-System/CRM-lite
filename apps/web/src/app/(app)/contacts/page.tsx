"use client";

import { PERMISSION_KEYS } from "@nbs/shared";
import { ContactsWorkspace } from "@/components/contacts/contacts-workspace";
import { PermissionGate } from "@/components/permission-gate";

export default function ContactsPage() {
  return (
    <PermissionGate permission={PERMISSION_KEYS.CONTACTS_VIEW}>
      <ContactsWorkspace />
    </PermissionGate>
  );
}
