"use client";

import {
  createUserSchema,
  PERMISSION_KEYS,
  type AuthUser,
} from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RequiredLabel } from "@/components/crm/selects";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can } from "@/components/permission-gate";
import {
  PageFrame,
  PageHeader,
  QueryPanel,
  TableSkeleton,
} from "@/components/crm/primitives";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";

interface UserFormState {
  name: string;
  email: string;
  password: string;
  roleId: string;
}

const emptyForm: UserFormState = {
  name: "",
  email: "",
  password: "",
  roleId: "",
};

export function UsersManager() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AuthUser | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);

  function formatDate(value: string | null): string {
    if (!value) {
      return t("common.never");
    }
    return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ users: AuthUser[] }>("/users"),
  });

  const rolesQuery = useQuery({
    queryKey: ["role-options"],
    queryFn: () => api.get<{ roles: Array<{ id: string; name: string }> }>("/roles/options"),
  });

  const roleOptions = useMemo(() => {
    const loadedRoles = rolesQuery.data?.roles ?? [];
    if (loadedRoles.length > 0) {
      return loadedRoles;
    }
    const unique = new Map<string, { id: string; name: string }>();
    for (const user of usersQuery.data?.users ?? []) {
      unique.set(user.role.id, user.role);
    }
    return [...unique.values()];
  }, [rolesQuery.data?.roles, usersQuery.data?.users]);

  const createMutation = useMutation({
    mutationFn: (input: UserFormState) => api.post<{ user: AuthUser }>("/users", input),
    onSuccess: async () => {
      toast.success(t("toasts.userCreated"));
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(error.fields ?? {}).map(([key, messages]) => [
              key,
              messages?.[0] ?? error.message,
            ]),
          ),
        );
        toast.error(error.message);
        return;
      }
      toast.error(t("users.createFailed"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; body: Record<string, unknown> }) =>
      api.patch<{ user: AuthUser }>(`/users/${input.id}`, input.body),
    onSuccess: async () => {
      toast.success(t("toasts.userUpdated"));
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("users.updateFailed"));
    },
  });

  const activationMutation = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      api.patch<{ user: AuthUser }>(`/users/${input.id}/activation`, {
        isActive: input.isActive,
      }),
    onSuccess: async (_, variables) => {
      toast.success(
        variables.isActive ? t("toasts.userActivated") : t("toasts.userDeactivated"),
      );
      setPendingUser(null);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : t("users.statusFailed"),
      );
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setFormOpen(true);
  }

  function openEdit(user: AuthUser) {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      roleId: user.role.id,
    });
    setFieldErrors({});
    setFormOpen(true);
  }

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});

    if (editing) {
      const body: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        roleId: form.roleId,
      };
      if (form.password) {
        body.password = form.password;
      }
      updateMutation.mutate({ id: editing.id, body });
      return;
    }

    const parsed = createUserSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        next[key] ??= issue.message;
      }
      setFieldErrors(next);
      return;
    }

    createMutation.mutate(parsed.data);
  }

  const busy = createMutation.isPending || updateMutation.isPending;
  const activatingId =
    activationMutation.isPending && activationMutation.variables
      ? activationMutation.variables.id
      : null;

  return (
    <PageFrame width="wide">
      <PageHeader
        title={t("users.title")}
        description={t("users.description")}
        actions={
          <Can permission={PERMISSION_KEYS.USERS_CREATE}>
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              {t("users.add")}
            </Button>
          </Can>
        }
      />

      <QueryPanel
        query={usersQuery}
        skeleton={<TableSkeleton cols={6} />}
        errorMessage={t("users.loadFailed")}
      >
        {(data) => (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-border/80 bg-card md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("users.name")}</TableHead>
                    <TableHead>{t("users.email")}</TableHead>
                    <TableHead>{t("users.role")}</TableHead>
                    <TableHead>{t("users.status")}</TableHead>
                    <TableHead>{t("users.lastSignIn")}</TableHead>
                    <TableHead className="w-[220px] text-end">{t("users.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell dir="ltr">{user.email}</TableCell>
                      <TableCell>{user.role.name}</TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? "success" : "warning"}>
                          {user.isActive ? t("common.active") : t("common.inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(user.lastLoginAt)}
                      </TableCell>
                      <TableCell className="w-[220px] text-end">
                        <div className="ms-auto flex w-[200px] items-center justify-end gap-2">
                          <Can permission={PERMISSION_KEYS.USERS_UPDATE}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-[72px]"
                              onClick={() => openEdit(user)}
                            >
                              {t("common.edit")}
                            </Button>
                          </Can>
                          <Can permission={PERMISSION_KEYS.USERS_DEACTIVATE}>
                            <Button
                              variant={user.isActive ? "outline" : "secondary"}
                              size="sm"
                              className="w-[112px]"
                              loading={activatingId === user.id}
                              onClick={() => setPendingUser(user)}
                            >
                              {user.isActive ? t("users.deactivate") : t("users.activate")}
                            </Button>
                          </Can>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-2 md:hidden">
              {data.users.map((user) => (
                <div
                  key={user.id}
                  className="rounded-xl border border-border/80 bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium" dir="auto">
                        {user.name}
                      </p>
                      <p className="truncate text-sm text-muted-foreground" dir="ltr">
                        {user.email}
                      </p>
                    </div>
                    <Badge variant={user.isActive ? "success" : "warning"}>
                      {user.isActive ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </div>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{t("users.role")}</dt>
                      <dd>{user.role.name}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{t("users.lastSignIn")}</dt>
                      <dd className="text-muted-foreground" dir="ltr">
                        {formatDate(user.lastLoginAt)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex justify-end gap-2 border-t border-border/60 pt-3">
                    <Can permission={PERMISSION_KEYS.USERS_UPDATE}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-[72px]"
                        onClick={() => openEdit(user)}
                      >
                        {t("common.edit")}
                      </Button>
                    </Can>
                    <Can permission={PERMISSION_KEYS.USERS_DEACTIVATE}>
                      <Button
                        variant={user.isActive ? "outline" : "secondary"}
                        size="sm"
                        className="w-[112px]"
                        loading={activatingId === user.id}
                        onClick={() => setPendingUser(user)}
                      >
                        {user.isActive ? t("users.deactivate") : t("users.activate")}
                      </Button>
                    </Can>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </QueryPanel>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <form onSubmit={submitForm} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing ? t("users.edit") : t("users.create")}</DialogTitle>
              <DialogDescription>
                {editing ? t("users.editDescription") : t("users.createDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <RequiredLabel htmlFor="user-name" required>
                {t("users.name")}
              </RequiredLabel>
              <Input
                id="user-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
              <p className="min-h-5 text-xs text-destructive">{fieldErrors.name}</p>
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="user-email" required>
                {t("users.email")}
              </RequiredLabel>
              <Input
                id="user-email"
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
              />
              <p className="min-h-5 text-xs text-destructive">{fieldErrors.email}</p>
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="user-password" required={!editing}>
                {editing ? t("users.newPasswordOptional") : t("users.password")}
              </RequiredLabel>
              <Input
                id="user-password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
              />
              <p className="min-h-5 text-xs text-destructive">{fieldErrors.password}</p>
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="user-role" required>
                {t("users.role")}
              </RequiredLabel>
              <Select
                value={form.roleId}
                onValueChange={(value) => setForm((current) => ({ ...current, roleId: value }))}
              >
                <SelectTrigger id="user-role">
                  <SelectValue placeholder={t("users.selectRole")} />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="min-h-5 text-xs text-destructive">{fieldErrors.roleId}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={busy}>
                {editing ? t("users.saveChanges") : t("users.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingUser)} onOpenChange={() => setPendingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingUser?.isActive ? t("users.deactivateTitle") : t("users.activateTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingUser?.isActive
                ? t("users.deactivateBody", { name: pendingUser.name })
                : pendingUser?.name
                  ? t("users.activateBody", { name: pendingUser.name })
                  : t("users.activateBodyGeneric")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingUser) return;
                activationMutation.mutate({
                  id: pendingUser.id,
                  isActive: !pendingUser.isActive,
                });
              }}
            >
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFrame>
  );
}
