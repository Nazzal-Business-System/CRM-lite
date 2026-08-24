"use client";

import {
  groupPermissionsByCategory,
  PERMISSION_KEYS,
  SYSTEM_ROLE_NAMES,
  type PermissionDefinition,
  type RoleSummary,
} from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RequiredLabel } from "@/components/crm/selects";
import { Can } from "@/components/permission-gate";
import {
  CardListSkeleton,
  PageFrame,
  PageHeader,
  QueryPanel,
} from "@/components/crm/primitives";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const EMPTY_CATALOG: PermissionDefinition[] = [];

function permissionCategoryLabel(
  category: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  return t(`roles.permissions.${category.toLowerCase()}`);
}

function permissionActionLabel(
  actionLabel: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  return t(`roles.permissions.${actionLabel.toLowerCase()}`);
}

function RoleEditor({
  role,
  creating,
  catalog,
  onCreated,
  onCancelCreate,
  onDelete,
}: {
  role: RoleSummary | null;
  creating: boolean;
  catalog: PermissionDefinition[];
  onCreated: (roleId: string) => void;
  onCancelCreate: () => void;
  onDelete: (role: RoleSummary) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissionKeys, setPermissionKeys] = useState<string[]>(
    role?.permissionKeys ?? [],
  );
  const [baseline, setBaseline] = useState({
    name: role?.name ?? "",
    description: role?.description ?? "",
    permissionKeys: [...(role?.permissionKeys ?? [])].sort().join("|"),
  });

  const grouped = useMemo(
    () => groupPermissionsByCategory(catalog),
    [catalog],
  );

  const dirty =
    creating ||
    name !== baseline.name ||
    description !== baseline.description ||
    [...permissionKeys].sort().join("|") !== baseline.permissionKeys;

  const adminLocked =
    Boolean(role?.isSystem && role.name === SYSTEM_ROLE_NAMES.ADMIN) && !creating;
  const systemNameLocked = Boolean(role?.isSystem && !creating);

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ role: RoleSummary }>("/roles", {
        name,
        description,
        permissionKeys,
      }),
    onSuccess: async (data) => {
      toast.success(t("toasts.roleCreated"));
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      onCreated(data.role.id);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("roles.createFailed"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch<{ role: RoleSummary }>(`/roles/${role?.id}`, {
        name,
        description,
        ...(adminLocked ? {} : { permissionKeys }),
      }),
    onSuccess: async () => {
      toast.success(t("toasts.roleUpdated"));
      setBaseline({
        name,
        description,
        permissionKeys: [...permissionKeys].sort().join("|"),
      });
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("roles.updateFailed"));
    },
  });

  const busy = createMutation.isPending || updateMutation.isPending;

  function togglePermission(key: string, checked: boolean) {
    if (adminLocked) {
      return;
    }
    setPermissionKeys((current) =>
      checked ? [...new Set([...current, key])] : current.filter((item) => item !== key),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{creating ? t("roles.create") : role?.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <RequiredLabel htmlFor="role-name" required>
              {t("roles.name")}
            </RequiredLabel>
            <Input
              id="role-name"
              value={name}
              disabled={systemNameLocked}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <RequiredLabel htmlFor="role-description">
              {t("roles.descriptionField")}
            </RequiredLabel>
            <Input
              id="role-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>

        {adminLocked ? (
          <p className="text-sm text-muted-foreground">{t("roles.adminLock")}</p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {grouped.map((group) => (
            <div key={group.category} className="rounded-lg border border-border p-4">
              <p className="mb-3 text-sm font-medium">
                {permissionCategoryLabel(group.category, t)}
              </p>
              <div className="space-y-2">
                {group.permissions.map((permission) => {
                  const checked = permissionKeys.includes(permission.key);
                  return (
                    <label
                      key={permission.key}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={adminLocked}
                        onCheckedChange={(value) =>
                          togglePermission(permission.key, value === true)
                        }
                      />
                      <span>{permissionActionLabel(permission.actionLabel, t)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="h-16" aria-hidden />
        <div className="sticky bottom-0 z-10 -mx-6 border-t border-border bg-card/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {dirty && !busy ? t("roles.unsavedChanges") : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <Can permission={PERMISSION_KEYS.ROLES_CREATE}>
                {creating ? (
                  <Button
                    onClick={() => createMutation.mutate()}
                    loading={createMutation.isPending}
                    disabled={!dirty || busy || !name.trim()}
                  >
                    {t("roles.create")}
                  </Button>
                ) : null}
              </Can>
              <Can permission={PERMISSION_KEYS.ROLES_UPDATE}>
                {!creating ? (
                  <Button
                    onClick={() => updateMutation.mutate()}
                    loading={updateMutation.isPending}
                    disabled={!dirty || busy}
                  >
                    {busy ? t("common.saving") : t("roles.saveChanges")}
                  </Button>
                ) : null}
              </Can>
              {!creating && role && !role.isSystem ? (
                <Can permission={PERMISSION_KEYS.ROLES_DELETE}>
                  <Button variant="outline" onClick={() => onDelete(role)} disabled={busy}>
                    <Trash2 className="size-4" />
                    {t("roles.delete")}
                  </Button>
                </Can>
              ) : null}
              {creating ? (
                <Button variant="ghost" onClick={onCancelCreate} disabled={busy}>
                  {t("common.cancel")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function RolesManager() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleSummary | null>(null);

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: () =>
      api.get<{ roles: RoleSummary[]; catalog: PermissionDefinition[] }>("/roles"),
  });

  const roles = rolesQuery.data?.roles ?? [];
  const catalog = rolesQuery.data?.catalog ?? EMPTY_CATALOG;
  const selected =
    creating || roles.length === 0
      ? null
      : (roles.find((role) => role.id === selectedId) ?? roles[0] ?? null);

  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => api.delete<{ ok: boolean }>(`/roles/${roleId}`),
    onSuccess: async () => {
      toast.success(t("toasts.roleDeleted"));
      setDeleteTarget(null);
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("roles.deleteFailed"));
    },
  });

  return (
    <PageFrame width="wide">
      <PageHeader
        title={t("roles.title")}
        description={t("roles.description")}
        actions={
          <Can permission={PERMISSION_KEYS.ROLES_CREATE}>
            <Button
              onClick={() => {
                setCreating(true);
                setSelectedId(null);
              }}
            >
              <Plus className="size-4" />
              {t("roles.add")}
            </Button>
          </Can>
        }
      />

      <QueryPanel
        query={rolesQuery}
        skeleton={<CardListSkeleton rows={4} />}
        errorMessage={t("roles.loadFailed")}
      >
        {() => (
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-1">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => {
                  setCreating(false);
                  setSelectedId(role.id);
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200",
                  !creating && selected?.id === role.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/60",
                )}
              >
                <span>
                  <span className="block font-medium">{role.name}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {role.userCount === 1
                      ? t("roles.userCountOne", { count: role.userCount })
                      : t("roles.userCountMany", { count: role.userCount })}
                  </span>
                </span>
                {role.isSystem ? <Badge variant="secondary">{t("roles.system")}</Badge> : null}
              </button>
            ))}
          </div>

          <RoleEditor
            key={creating ? "new" : selected?.id ?? "empty"}
            role={creating ? null : selected}
            creating={creating}
            catalog={catalog}
            onCreated={(roleId) => {
              setCreating(false);
              setSelectedId(roleId);
            }}
            onCancelCreate={() => setCreating(false)}
            onDelete={setDeleteTarget}
          />
        </div>
        )}
      </QueryPanel>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("roles.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.userCount > 0
                ? t("roles.deleteAssignedBody", {
                    name: deleteTarget.name,
                    count: deleteTarget.userCount,
                  })
                : t("roles.deleteBody", {
                    name: deleteTarget?.name ?? "",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            {deleteTarget && deleteTarget.userCount === 0 ? (
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
              >
                {t("common.delete")}
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFrame>
  );
}
