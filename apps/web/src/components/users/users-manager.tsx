"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PERMISSION_KEYS as P, type AuthUser } from "@nbs/shared";
import { Plus, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useI18n } from "@/i18n/provider";
import { PartnerEditor } from "./partner-editor";
import { PageFrame, PageHeader, QueryPanel, TableSkeleton, Surface } from "@/components/crm/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnumSelect } from "@/components/crm/selects";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { api, ApiError } from "@/lib/api";
import { canManageUserMarkets } from "@/lib/market-management";
import { partnerActorKey, type PartnerEditorTarget } from "@/lib/partners";
import { useDebouncedValue } from "@/lib/query";

export function UsersManager({ initialEditor = null }: { initialEditor?: PartnerEditorTarget | null }) {
  const router = useRouter();
  const [editor, setEditor] = useState<PartnerEditorTarget | null>(initialEditor);
  const opener = useRef<HTMLElement | null>(null);
  const fallback = useRef<HTMLDivElement>(null);
  const openEditor = (next: PartnerEditorTarget, trigger: HTMLElement) => { opener.current = trigger; setEditor(next); };
  const closeEditor = () => { setEditor(null); if (initialEditor) router.replace("/admin/users", { scroll: false }); };
  const restoreFocus = () => { if (opener.current?.isConnected) opener.current.focus(); else fallback.current?.focus(); };
  const { t, locale, dir } = useI18n(); const { user: viewer } = useAuth(); const client = useQueryClient();
  const [search, setSearch] = useState(""); const [kind, setKind] = useState("all"); const [pending, setPending] = useState<AuthUser | null>(null);
  const debounced = useDebouncedValue(search);
  const query = useQuery({ queryKey: ["users", ...partnerActorKey(viewer)], queryFn: () => api.get<{ users: AuthUser[] }>("/users"), retry: false });
  const mutation = useMutation({ mutationFn: (target: AuthUser) => api.patch(`/users/${encodeURIComponent(target.id)}/activation`, { isActive: !target.isActive }), onSuccess: async () => { setPending(null); await client.invalidateQueries({ queryKey: ["users"] }); await client.invalidateQueries({ queryKey: ["auth", "me"] }); } });
  const date = (value: string | null) => value ? new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { dateStyle: "medium" }).format(new Date(value)) : t("common.never");
  return <PageFrame width="wide"><div ref={fallback} tabIndex={-1} className="outline-none"><PageHeader title={t("partners.title")} description={t("partners.description")} actions={viewer?.permissions.includes(P.USERS_CREATE) && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={event => openEditor({ mode: "create", internal: true }, event.currentTarget)}>{t("partners.createInternal")}</Button>{canManageUserMarkets(viewer) && <Button onClick={event => openEditor({ mode: "create", internal: false }, event.currentTarget)}><Plus className="size-4" aria-hidden="true" />{t("partners.add")}</Button>}</div>} />
    </div>
    <div className="flex flex-col gap-3 sm:flex-row"><Input value={search} onChange={event => setSearch(event.target.value)} aria-label={t("partners.search")} placeholder={t("partners.search")} maxLength={200} className="sm:max-w-md" /><div className="sm:min-w-48"><label htmlFor="partner-filter" className="sr-only">{t("partners.accountType")}</label><EnumSelect id="partner-filter" dir={dir} value={kind} onChange={setKind} options={[{ value: "all", label: t("partners.all") }, { value: "PARTNER", label: t("partners.title") }, { value: "INTERNAL", label: t("partners.internal") }]} /></div></div>
    <QueryPanel query={query} skeleton={<TableSkeleton cols={5} />} errorMessage={t("partners.unavailable")} isEmpty={data => data.users.length === 0} empty={<p>{t("common.empty")}</p>}>{data => {
      const users = data.users.filter(user => (kind === "all" || (user.accountType ?? "INTERNAL") === kind) && `${user.name} ${user.email}`.toLowerCase().includes(debounced.toLowerCase()));
      return users.length ? <Surface className="divide-y divide-border/60">{users.map(user => <article key={user.id} className="grid min-w-0 items-center gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-sm font-semibold">{user.name}</h2><Badge variant={user.isActive ? "success" : "outline"}>{t(user.isActive ? "common.active" : "common.inactive")}</Badge></div><p className="break-all text-xs text-muted-foreground"><bdi>{user.email}</bdi></p><p className="text-xs text-muted-foreground">{t(user.accountType === "PARTNER" ? "partners.partner" : "partners.internal")} · {user.role.name}</p></div>
        <div className="space-y-2 text-xs"><div className="flex flex-wrap gap-1.5">{user.marketCodes?.length ? user.marketCodes.map(code => <Badge key={code} variant="secondary"><bdi>{code === "OTHER" ? t("partners.international") : code}</bdi></Badge>) : <span className="text-muted-foreground">{t("markets.noneAssigned")}</span>}</div><p className="text-muted-foreground">{t("partners.defaultMarket")}: <bdi>{user.defaultMarketCode === "OTHER" ? t("partners.international") : user.defaultMarketCode ?? "—"}</bdi>{user.initialDisplayCurrency && <> · <bdi>{user.initialDisplayCurrency}</bdi></>}</p><p className="text-muted-foreground">{t("users.lastSignIn")}: <bdi>{date(user.lastLoginAt)}</bdi></p></div>
        <div className="flex flex-wrap gap-2">{viewer?.permissions.includes(P.USERS_UPDATE) && <Button variant="outline" size="sm" onClick={event => openEditor({ mode: "edit", id: user.id }, event.currentTarget)}>{t("common.edit")}<ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" /></Button>}{viewer?.permissions.includes(P.USERS_DEACTIVATE) && <Button size="sm" variant="ghost" onClick={() => { mutation.reset(); setPending(user); }}>{t(user.isActive ? "users.deactivate" : "users.activate")}</Button>}</div>
      </article>)}</Surface> : <p role="status" className="py-12 text-center text-sm text-muted-foreground">{t("partners.noMatches")}</p>;
    }}</QueryPanel>
    {editor && <PartnerEditor key={JSON.stringify([...partnerActorKey(viewer), editor])} editor={editor} onClose={closeEditor} returnFocus={restoreFocus} />}
    <AlertDialog open={!!pending} onOpenChange={open => { if (!open && !mutation.isPending) setPending(null); }}><AlertDialogContent dir={dir}><AlertDialogTitle>{t(pending?.accountType === "PARTNER" ? pending.isActive ? "partners.deactivatePartner" : "partners.activatePartner" : pending?.isActive ? "users.deactivateTitle" : "users.activateTitle")}</AlertDialogTitle><AlertDialogDescription>{t(pending?.accountType === "PARTNER" ? pending.isActive ? "partners.deactivatePartnerBody" : "partners.activatePartnerBody" : pending?.isActive ? "users.deactivateBody" : "users.activateBody", { name: pending?.name ?? "" })}</AlertDialogDescription>{mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error instanceof ApiError ? mutation.error.message : t("partners.unavailable")}</p>}<AlertDialogFooter><AlertDialogCancel disabled={mutation.isPending}>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction disabled={mutation.isPending} onClick={event => { event.preventDefault(); if (pending) mutation.mutate(pending); }}>{t(mutation.isPending ? "common.saving" : "common.confirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </PageFrame>;
}
