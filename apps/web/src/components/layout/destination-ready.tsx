"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId } from "react";
import { normalizeAppPath, useRouteReadyStore } from "@/stores/navigation-store";

export function useDestinationReady(ready: boolean): void {
  const id = useId();
  const pathname = usePathname();
  const register = useRouteReadyStore((state) => state.register);
  const unregister = useRouteReadyStore((state) => state.unregister);

  useEffect(() => {
    register(id, ready, pathname);
    return () => unregister(id);
  }, [id, pathname, ready, register, unregister]);
}

export function DestinationReady({ ready }: { ready: boolean }) {
  useDestinationReady(ready);
  return null;
}

export function allDestinationsReady(
  blockers: Record<string, { ready: boolean; pathname: string }>,
  pathname: string,
): boolean {
  const relevant = Object.values(blockers).filter(
    (entry) => normalizeAppPath(entry.pathname) === normalizeAppPath(pathname),
  );
  return relevant.length > 0 && relevant.every((entry) => entry.ready);
}
