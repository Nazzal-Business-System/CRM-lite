"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { SidebarNav } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { titleForPath } from "@/lib/navigation";
import { useI18n } from "@/i18n/provider";
import { usePathname } from "next/navigation";

export function TopBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { t, locale } = useI18n();

  const titleKey =
    pathname === "/"
      ? "nav.dashboard"
      : pathname.startsWith("/admin/recruitment")
        ? "nav.recruitment"
        : pathname.startsWith("/admin/users")
          ? "nav.users"
          : pathname.startsWith("/admin/roles")
            ? "nav.roles"
            : pathname.startsWith("/companies")
              ? "nav.companies"
              : pathname.startsWith("/research")
                ? "nav.research"
                : pathname.startsWith("/contacts")
                  ? "nav.contacts"
                  : pathname.startsWith("/opportunities")
                    ? "nav.opportunities"
                    : pathname.startsWith("/activities")
                      ? "nav.activities"
                      : pathname.startsWith("/tasks")
                        ? "nav.tasks"
                        : pathname.startsWith("/imports")
                          ? "nav.imports"
                          : null;

  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label={t("nav.openNavigation")}
          onClick={() => setOpen(true)}
        >
          <Menu className="size-4" />
        </Button>
        <h1 className="truncate text-sm font-medium">
          {titleKey ? t(titleKey) : titleForPath(pathname)}
        </h1>
      </div>
      <div className="flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
        <div className="md:hidden">
          <UserMenu compact />
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={locale === "ar" ? "right" : "left"}
          className="flex h-dvh w-72 flex-col p-0"
        >
          <SheetHeader className="border-b border-sidebar-border">
            <SheetTitle>
              <BrandLockup compact className="size-24" />
            </SheetTitle>
          </SheetHeader>
          <SidebarNav collapsed={false} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
