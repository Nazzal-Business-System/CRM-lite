import { create } from "zustand";

interface NavigationState {
  pendingHref: string | null;
  generation: number;
  start: (href: string) => void;
  complete: () => void;
}

export function normalizeAppPath(href: string): string {
  try {
    const url =
      href.startsWith("http://") || href.startsWith("https://")
        ? new URL(href)
        : new URL(href, "http://nbs.local");
    return url.pathname || "/";
  } catch {
    return href.split("?")[0] || "/";
  }
}

export function isSameAppPath(current: string, target: string): boolean {
  return normalizeAppPath(current) === normalizeAppPath(target);
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  pendingHref: null,
  generation: 0,
  start: (href) => {
    set({
      pendingHref: normalizeAppPath(href),
      generation: get().generation + 1,
    });
  },
  complete: () => {
    if (get().pendingHref) {
      set({ pendingHref: null });
    }
  },
}));

interface RouteReadyEntry {
  ready: boolean;
  pathname: string;
}

interface RouteReadyState {
  blockers: Record<string, RouteReadyEntry>;
  register: (id: string, ready: boolean, pathname: string) => void;
  unregister: (id: string) => void;
}

export const useRouteReadyStore = create<RouteReadyState>((set) => ({
  blockers: {},
  register: (id, ready, pathname) =>
    set((state) => ({
      blockers: {
        ...state.blockers,
        [id]: { ready, pathname },
      },
    })),
  unregister: (id) =>
    set((state) => {
      if (!(id in state.blockers)) {
        return state;
      }
      const next = { ...state.blockers };
      delete next[id];
      return { blockers: next };
    }),
}));
