import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarState {
  collapsed: boolean;
  sectionCollapsed: Record<"workspace" | "administration", boolean>;
  toggleSection: (section: "workspace" | "administration") => void;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      sectionCollapsed: { workspace: false, administration: false },
      toggleSection: (section) => set(state => ({ sectionCollapsed: { ...state.sectionCollapsed, [section]: !state.sectionCollapsed[section] } })),
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    { name: "nbs-sidebar" },
  ),
);
