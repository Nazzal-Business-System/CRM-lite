import {
  Building2,
  Contact,
  Handshake,
  Import,
  LayoutDashboard,
  ListTodo,
  NotebookPen,
  Search,
  Shield,
  UserRoundSearch,
  Users,
} from "lucide-react";
import { PERMISSION_KEYS, type PermissionKey } from "@nbs/shared";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: PermissionKey;
}

export interface NavSection {
  id: "workspace" | "administration";
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        permission: PERMISSION_KEYS.DASHBOARD_VIEW,
      },
      {
        href: "/companies",
        label: "Companies",
        icon: Building2,
        permission: PERMISSION_KEYS.COMPANIES_VIEW,
      },
      {
        href: "/research",
        label: "Research",
        icon: Search,
        permission: PERMISSION_KEYS.COMPANIES_VIEW,
      },
      {
        href: "/contacts",
        label: "Contacts",
        icon: Contact,
        permission: PERMISSION_KEYS.CONTACTS_VIEW,
      },
      {
        href: "/opportunities",
        label: "Opportunities",
        icon: Handshake,
        permission: PERMISSION_KEYS.OPPORTUNITIES_VIEW,
      },
      {
        href: "/activities",
        label: "Activities",
        icon: NotebookPen,
        permission: PERMISSION_KEYS.ACTIVITIES_VIEW,
      },
      {
        href: "/tasks",
        label: "Tasks",
        icon: ListTodo,
        permission: PERMISSION_KEYS.TASKS_VIEW,
      },
      {
        href: "/imports",
        label: "Imports",
        icon: Import,
        permission: PERMISSION_KEYS.IMPORTS_VIEW,
      },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    items: [
      {
        href: "/admin/users",
        label: "Users",
        icon: Users,
        permission: PERMISSION_KEYS.USERS_VIEW,
      },
      {
        href: "/admin/roles",
        label: "Roles & Permissions",
        icon: Shield,
        permission: PERMISSION_KEYS.ROLES_VIEW,
      },
      {
        href: "/admin/recruitment",
        label: "Sales Recruitment",
        icon: UserRoundSearch,
        permission: PERMISSION_KEYS.RECRUITMENT_VIEW,
      },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/companies": "Companies",
  "/research": "Research",
  "/contacts": "Contacts",
  "/opportunities": "Opportunities",
  "/activities": "Activities",
  "/tasks": "Tasks",
  "/imports": "Imports",
  "/admin/users": "Users",
  "/admin/roles": "Roles & Permissions",
  "/admin/recruitment": "Sales Recruitment",
};

export function visibleNavSections(permissions: readonly string[]): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => permissions.includes(item.permission)),
  })).filter((section) => section.items.length > 0);
}

export function defaultAuthenticatedPath(permissions: readonly string[]): string {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (permissions.includes(item.permission)) {
        return item.href;
      }
    }
  }
  return "/";
}

export function titleForPath(pathname: string): string {
  if (PAGE_TITLES[pathname]) {
    return PAGE_TITLES[pathname];
  }

  const match = Object.entries(PAGE_TITLES)
    .filter(([path]) => path !== "/")
    .sort((a, b) => b[0].length - a[0].length)
    .find(([path]) => pathname === path || pathname.startsWith(`${path}/`));

  return match?.[1] ?? "NBS CRM";
}
