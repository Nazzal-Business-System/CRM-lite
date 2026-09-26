"use client";

import { hasPermission, PERMISSION_KEYS, type OwnershipEntityType, type OwnershipRequestRecord, type UserRef } from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { UserSelect } from "@/components/crm/selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";
import { toQuery } from "@/lib/query";
import { useAuth } from "@/providers/auth-provider";

export function OwnerControl({
  entityType,
  entityId,
  owner,
  value,
  onChange,
  allowEmpty = false,
}: {
  entityType: OwnershipEntityType;
  entityId?: string;
  owner: UserRef | null;
  value: string | null;
  onChange: (value: string | null) => void;
  allowEmpty?: boolean;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const client = useQueryClient();
  const canAssign = hasPermission(user?.permissions ?? [], PERMISSION_KEYS.OWNERSHIP_ASSIGN);
  const canRequest = hasPermission(user?.permissions ?? [], PERMISSION_KEYS.OWNERSHIP_REQUESTS_CREATE);
  const pending = useQuery({
    queryKey: ["ownership-request", "mine", entityType, entityId],
    queryFn: () => api.get<{ request: OwnershipRequestRecord | null }>(`/ownership-requests/mine/pending${toQuery({ entityType, entityId })}`),
    enabled: Boolean(entityId && user && !canAssign),
  });
  const request = useMutation({
    mutationFn: () => api.post("/ownership-requests", { entityType, entityId }),
    onSuccess: async () => {
      toast.success(t("ownership.requestSent"));
      await Promise.all([
        client.invalidateQueries({ queryKey: ["ownership-request", "mine", entityType, entityId] }),
        client.invalidateQueries({ queryKey: ["ownership-requests"] }),
        client.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("ownership.requestFailed")),
  });

  if (!user) return null;
  if (canAssign) {
    return <UserSelect allowEmpty={allowEmpty} value={value} onChange={onChange} />;
  }

  const creating = !entityId;
  const isOwner = owner?.id === user.id;
  const displayName = creating ? user.name : owner?.name ?? t("common.unassigned");

  return <div className="space-y-2">
    <Input value={displayName} readOnly aria-readonly className="bg-muted/45" />
    {!creating && !isOwner && canRequest ? (
      pending.data?.request ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" />{t("ownership.requestPending")}</p>
      ) : (
        <Button type="button" size="sm" variant="outline" loading={request.isPending} onClick={() => request.mutate()}><UserRoundCheck className="size-4" />{t("ownership.requestOwnership")}</Button>
      )
    ) : null}
  </div>;
}
