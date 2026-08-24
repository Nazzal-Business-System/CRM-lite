"use client";

import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { SidebarBrand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AppLink } from "@/components/layout/app-link";
import { UserMenu } from "@/components/layout/user-menu";
import { visibleNavSections } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useI18n } from "@/i18n/provider";
import { useSidebarStore } from "@/stores/sidebar-store";
import { useNavigationStore } from "@/stores/navigation-store";

const NAV_LABEL_KEYS: Record<string, string> = {
  "/": "nav.dashboard",
  "/companies": "nav.companies",
  "/research": "nav.research",
  "/contacts": "nav.contacts",
  "/opportunities": "nav.opportunities",
  "/activities": "nav.activities",
  "/tasks": "nav.tasks",
  "/imports": "nav.imports",
  "/admin/users": "nav.users",
  "/admin/roles": "nav.roles",
  "/admin/recruitment": "nav.recruitment",
};

function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const label = collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar");
  const icon = collapsed ? (
    <PanelLeftOpen className="size-4 rtl:rotate-180" />
  ) : (
    <PanelLeftClose className="size-4 rtl:rotate-180" />
  );

  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-expanded={!collapsed}
      onClick={onToggle}
      className="size-10 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      {icon}
    </Button>
  );

  if (!collapsed) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useI18n();
  const pendingHref = useNavigationStore((state) => state.pendingHref);
  const sections = visibleNavSections(user?.permissions ?? []);

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 py-3">
      {sections.map((section) => (
        <div key={section.id} className="space-y-1">
          {!collapsed ? (
            <p className="px-2.5 pb-1 text-[11px] font-medium text-muted-foreground">
              {t(section.id === "workspace" ? "nav.workspace" : "nav.administration")}
            </p>
          ) : (
            <div className="mx-auto mb-1 h-px w-6 bg-sidebar-border" />
          )}
          {section.items.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const pending = pendingHref === item.href;
            const label = t(NAV_LABEL_KEYS[item.href] ?? item.label);
            const content = (
              <AppLink
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-2.5 text-sm transition-colors duration-200",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/78 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
                  pending && !active && "bg-sidebar-accent/45",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {!collapsed ? <span className="truncate">{label}</span> : null}
              </AppLink>
            );

            if (!collapsed) {
              return <div key={item.href}>{content}</div>;
            }

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{content}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function DesktopSidebar() {
  const collapsed = useSidebarStore((state) => state.collapsed);
  const toggle = useSidebarStore((state) => state.toggle);

  return (
    <aside
      className={cn(
        "relative z-20 hidden h-full min-h-0 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-20" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 px-2",
          collapsed ? "h-auto flex-col py-3" : "h-14 justify-between",
        )}
      >
        <AppLink
          href="/"
          className={cn(
            "flex min-w-0 items-center",
            collapsed ? "justify-center py-1" : "px-1",
          )}
          aria-label="NBS CRM home"
        >
          <SidebarBrand collapsed={collapsed} />
        </AppLink>
        <SidebarToggle collapsed={collapsed} onToggle={toggle} />
      </div>
      <SidebarNav collapsed={collapsed} />
      <div className="mt-auto shrink-0 border-t border-sidebar-border p-2">
        <UserMenu compact={collapsed} />
      </div>
    </aside>
  );
}
