"use client";

import type { LucideIcon } from "lucide-react";
import { LoaderCircle, RefreshCw, Search } from "lucide-react";
import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { ApiError, isServiceUnavailable } from "@/lib/api";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DestinationReady } from "@/components/layout/destination-ready";

export function PageFrame({
  children,
  width = "default",
  className,
}: {
  children: ReactNode;
  width?: "default" | "wide" | "full";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full space-y-6",
        width === "default" && "max-w-6xl",
        width === "wide" && "max-w-[88rem]",
        width === "full" && "max-w-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  count,
  actions,
}: {
  title: string;
  description?: string;
  count?: number;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="text-[1.65rem] font-semibold tracking-[-0.03em]">{title}</h2>
          {count != null ? (
            <span className="text-sm tabular-nums text-muted-foreground">{count}</span>
          ) : null}
        </div>
        {description ? (
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function DataToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-px overflow-visible rounded-xl border border-border/80 bg-card shadow-[0_1px_2px_oklch(0.2_0.03_255_/_0.04)] sm:flex-row sm:items-stretch">
      {children}
    </div>
  );
}

export function ToolbarSearch({
  value,
  onChange,
  placeholder,
  loading = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  loading?: boolean;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
      {loading ? (
        <LoaderCircle className="pointer-events-none absolute top-1/2 end-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : null}
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-11 rounded-none border-0 bg-transparent ps-9 shadow-none focus-visible:ring-0",
          loading && "pe-9",
        )}
      />
    </div>
  );
}

export function ToolbarFilter({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-[11rem] border-border/80 sm:border-s",
        "[&_button]:h-11 [&_button]:rounded-none [&_button]:border-0 [&_button]:shadow-none",
        className,
      )}
    >
      {label ? (
        <div className="flex h-11 items-center gap-2 px-3">
          <span className="shrink-0 text-[12px] text-muted-foreground">{label}</span>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function Surface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-card shadow-[0_1px_2px_oklch(0.2_0.03_255_/_0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <Surface className="px-6 py-10">
      <div className="mx-auto flex max-w-md items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          {actions ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
        </div>
      </div>
    </Surface>
  );
}

export function ServiceError({
  error,
  onRetry,
  message,
}: {
  error?: unknown;
  onRetry?: () => void;
  message?: string;
}) {
  const { t } = useI18n();
  const text =
    message ??
    (error instanceof ApiError
      ? isServiceUnavailable(error)
        ? error.message
        : error.message
      : t("errors.loadFailed"));

  return (
    <Surface className="flex items-center justify-between gap-4 px-4 py-3">
      <p className="text-sm text-foreground">{text}</p>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="size-3.5" />
          {t("common.retry")}
        </Button>
      ) : null}
    </Surface>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Surface className="overflow-hidden">
      <div className="grid gap-3 border-b border-border/70 px-4 py-3 md:grid-cols-[repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": cols } as never}>
        {Array.from({ length: cols }).map((_, index) => (
          <Skeleton key={index} className="h-3 w-20" />
        ))}
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="grid items-center gap-3 px-4 py-3.5 md:grid-cols-[repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": cols } as never}>
            {Array.from({ length: cols }).map((__, col) => (
              <Skeleton key={col} className={cn("h-4", col === 0 ? "w-40" : "w-24")} />
            ))}
          </div>
        ))}
      </div>
    </Surface>
  );
}

export function CardListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <Surface key={index} className="flex items-center justify-between px-4 py-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-5 w-16" />
        </Surface>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-20" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}

export function QueryPanel<T>({
  query,
  skeleton,
  empty,
  isEmpty,
  errorMessage,
  children,
}: {
  query: UseQueryResult<T>;
  skeleton: ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  errorMessage?: string;
  children: (data: T) => ReactNode;
}) {
  const ready = !query.isPending;
  return (
    <>
      <DestinationReady ready={ready} />
      {query.isPending && !query.data ? (
        skeleton
      ) : query.isError && !query.data ? (
        <ServiceError
          error={query.error}
          onRetry={() => {
            void query.refetch();
          }}
          message={errorMessage}
        />
      ) : query.data && isEmpty?.(query.data) ? (
        empty ?? null
      ) : query.data ? (
        children(query.data)
      ) : null}
    </>
  );
}

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        {t("common.totalPageOf", { total, page, pages })}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t("common.previous")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}

export function PriorityBadge({
  priority,
}: {
  priority: "HIGH" | "MEDIUM" | "LOW" | null;
}) {
  const { t } = useI18n();
  if (!priority) {
    return (
      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        {t("common.notScored")}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        priority === "HIGH" && "bg-destructive/12 text-destructive",
        priority === "MEDIUM" && "bg-warning/12 text-warning",
        priority === "LOW" && "bg-muted text-muted-foreground",
      )}
    >
      {t(`enums.priority.${priority}`)}
    </span>
  );
}

export function QualificationLabel({
  score,
  accessPending = false,
}: {
  score: number | null | undefined;
  accessPending?: boolean;
}) {
  const { t } = useI18n();
  const label =
    score == null
      ? t("common.dash")
      : accessPending
        ? t("companies.qualificationAccessPending", { score })
        : t("companies.qualificationScore", { score });

  if (!accessPending || score == null) {
    return (
      <span className="text-sm tabular-nums" dir="ltr">
        {label}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="cursor-help text-sm tabular-nums underline decoration-dotted underline-offset-2"
          dir="ltr"
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {t("companies.accessPendingHint")}
      </TooltipContent>
    </Tooltip>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return <p className="text-[13px] text-destructive">{message}</p>;
}

export function Fact({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}
