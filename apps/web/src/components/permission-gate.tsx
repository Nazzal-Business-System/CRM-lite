"use client";

import { hasPermission, type PermissionKey } from "@nbs/shared";
import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { DestinationReady } from "@/components/layout/destination-ready";
import { Surface } from "@/components/crm/primitives";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/providers/auth-provider";

export function PermissionGate({
  permission,
  children,
}: {
  permission: PermissionKey;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { user } = useAuth();

  if (!user || !hasPermission(user.permissions, permission)) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <DestinationReady ready />
        <Surface className="flex items-start gap-3 px-4 py-4">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">{t("errors.accessRestricted")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("errors.noPermissionView")}
            </p>
          </div>
        </Surface>
      </div>
    );
  }

  return children;
}

export function Can({
  permission,
  children,
}: {
  permission: PermissionKey;
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!user || !hasPermission(user.permissions, permission)) {
    return null;
  }
  return children;
}
