"use client";

import type { NotificationRecord, PaginatedResult } from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageFrame, PageHeader, PaginationBar, QueryPanel, Surface } from "@/components/crm/primitives";
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Response = PaginatedResult<NotificationRecord> & { unreadCount: number };

export function NotificationsPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["notifications", page], queryFn: () => api.get<Response>(`/notifications?page=${page}&pageSize=20`) });
  const read = useMutation({ mutationFn: (id: string) => api.patch(`/notifications/${id}/read`), onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }) });
  const readAll = useMutation({ mutationFn: () => api.post("/notifications/read-all"), onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }) });

  return (
    <PageFrame>
      <PageHeader title={t("notifications.title")} description={t("notifications.description")} count={query.data?.total} actions={<Button variant="outline" disabled={!query.data?.unreadCount} onClick={() => readAll.mutate()}><CheckCheck className="size-4" />{t("notifications.markAllRead")}</Button>} />
      <QueryPanel query={query} skeleton={<Surface className="h-48 animate-pulse"><span /></Surface>} isEmpty={(data) => data.items.length === 0} empty={<EmptyState icon={Bell} title={t("notifications.empty")} description={t("notifications.emptyDescription")} />}>
        {(data) => <>
          <Surface className="overflow-hidden">
            {data.items.map((item) => <button key={item.id} type="button" className={cn("flex w-full gap-3 border-b border-border/70 px-4 py-4 text-start last:border-0 hover:bg-accent", !item.readAt && "bg-primary/5")} onClick={() => { if (!item.readAt) read.mutate(item.id); if (item.link) router.push(item.link); }}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.readAt ? "bg-transparent" : "bg-primary")} />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{locale === "ar" ? item.titleAr ?? item.title : item.title}</span><span className="mt-1 block text-sm text-muted-foreground">{locale === "ar" ? item.messageAr ?? item.message : item.message}</span><span className="mt-1.5 block text-xs text-muted-foreground">{formatDateTime(item.createdAt, locale)}</span></span>
            </button>)}
          </Surface>
          <PaginationBar page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
        </>}
      </QueryPanel>
    </PageFrame>
  );
}
