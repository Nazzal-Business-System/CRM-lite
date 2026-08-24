"use client";

import type { ReactNode } from "react";
import { DesktopSidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/providers/auth-provider";
import { useRoutePending } from "@/components/layout/navigation-progress";
import { cn } from "@/lib/utils";

function ShellSkeleton() {
  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-background">
      <div className="hidden w-64 border-r border-sidebar-border bg-sidebar md:block">
        <div className="space-y-3 p-4">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Skeleton className="h-5 w-28" />
        </div>
        <div className="p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-6 h-48 w-full max-w-3xl" />
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const pending = useRoutePending();

  if (isLoading || !user) {
    return <ShellSkeleton />;
  }

  return (
    <div className="relative flex h-dvh max-h-dvh overflow-hidden bg-background">
      <DesktopSidebar />
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto py-6",
            // Equal physical L/R padding (avoids px/pe utility conflicts) + safe areas.
            "pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]",
            "sm:pl-[max(1.5rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.5rem,env(safe-area-inset-right,0px))]",
            "lg:pl-[max(2rem,env(safe-area-inset-left,0px))] lg:pr-[max(2rem,env(safe-area-inset-right,0px))]",
            pending && "opacity-90",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
