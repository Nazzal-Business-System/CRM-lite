"use client";

import type { NotificationRecord, PaginatedResult } from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type NotificationResponse = PaginatedResult<NotificationRecord> & { unreadCount: number };

export function NotificationBell() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: () => api.get<NotificationResponse>("/notifications?pageSize=6"),
    refetchInterval: 30_000,
  });
  const readMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const allMutation = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unread = query.data?.unreadCount ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("notifications.title")}>
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="absolute top-1 end-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={locale === "ar" ? "start" : "end"} className="w-[min(24rem,calc(100vw-1rem))]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t("notifications.title")}</h2>
          <Button variant="ghost" size="sm" disabled={!unread || allMutation.isPending} onClick={() => allMutation.mutate()}>
            <CheckCheck className="size-4" />
            {t("notifications.markAllRead")}
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {(query.data?.items ?? []).length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("notifications.empty")}</p>
          ) : (
            query.data?.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "block w-full cursor-pointer border-b border-border/70 px-4 py-3 text-start transition-colors hover:bg-accent/70 focus-visible:bg-accent/70",
                  item.readAt ? "bg-background" : "bg-primary/7",
                )}
                onClick={() => {
                  if (!item.readAt) readMutation.mutate(item.id);
                  setOpen(false);
                  if (item.link) router.push(item.link);
                }}
              >
                <span className="flex items-start gap-2">
                  {!item.readAt ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /> : null}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{locale === "ar" ? item.titleAr ?? item.title : item.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{locale === "ar" ? item.messageAr ?? item.message : item.message}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">{formatDateTime(item.createdAt, locale)}</span>
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
        <Button
          variant="ghost"
          className="w-full cursor-pointer rounded-none"
          onClick={() => {
            setOpen(false);
            router.push("/notifications");
          }}
        >
          {t("notifications.viewAll")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
