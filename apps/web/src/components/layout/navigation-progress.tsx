"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { allDestinationsReady } from "@/components/layout/destination-ready";
import {
  normalizeAppPath,
  useNavigationStore,
  useRouteReadyStore,
} from "@/stores/navigation-store";
import { cn } from "@/lib/utils";

export function NavigationProgress() {
  const pathname = usePathname();
  const pendingHref = useNavigationStore((state) => state.pendingHref);
  const complete = useNavigationStore((state) => state.complete);
  const blockers = useRouteReadyStore((state) => state.blockers);

  useEffect(() => {
    if (!pendingHref) {
      return;
    }

    if (normalizeAppPath(pathname) !== pendingHref) {
      return;
    }

    if (allDestinationsReady(blockers, pathname)) {
      complete();
    }
  }, [blockers, complete, pathname, pendingHref]);

  useEffect(() => {
    if (!pendingHref) {
      return;
    }

    function onPopState() {
      complete();
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [complete, pendingHref]);

  return (
    <div
      aria-hidden={!pendingHref}
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[80] h-[2px] overflow-hidden bg-transparent",
        !pendingHref && "opacity-0",
      )}
    >
      {pendingHref ? (
        <div className="h-full w-1/3 origin-left animate-[nbs-nav-progress_1.15s_ease-in-out_infinite] rounded-full bg-primary" />
      ) : null}
    </div>
  );
}

export function useRoutePending(): boolean {
  return useNavigationStore((state) => Boolean(state.pendingHref));
}
