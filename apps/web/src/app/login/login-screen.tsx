"use client";

import type { ReactNode } from "react";
import { NbsLogo } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { DestinationReady } from "@/components/layout/destination-ready";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/providers/auth-provider";

export function LoginScreen() {
  const { t } = useI18n();

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex min-h-svh w-full items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="w-full max-w-[1120px] md:-translate-y-2">
          <div className="mb-3 flex justify-end">
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-sm">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>

          <div className="grid w-full overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_50px_oklch(0.12_0.02_255_/_0.1)] md:min-h-[520px] md:grid-cols-[0.92fr_1.08fr] dark:shadow-[0_20px_55px_oklch(0.06_0.02_255_/_0.32)]">
            <section className="flex items-start px-7 pt-7 pb-3 sm:px-10 sm:pt-9 md:px-12 md:py-14 lg:px-16">
              <div className="max-w-[360px]">
                <NbsLogo className="size-32 rounded-none bg-transparent sm:size-36 md:size-44" />
                <h2 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-foreground sm:text-[1.4rem]">
                  {t("auth.productTitle")}
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                  {t("auth.panelTagline")}
                </p>
                <p className="mt-1 hidden text-sm leading-6 text-muted-foreground md:block">
                  {t("auth.accessNote")}
                </p>
              </div>
            </section>

            <section className="flex items-start px-7 pt-6 pb-9 sm:px-10 sm:pb-11 md:px-12 md:py-14 lg:px-16">
              <div className="w-full max-w-[420px]">
                <div className="mb-8">
                  <h1 className="text-[1.85rem] font-semibold tracking-[-0.035em] text-foreground">
                    {t("auth.loginTitle")}
                  </h1>
                  <p className="mt-2.5 text-sm leading-6 text-muted-foreground">
                    {t("auth.loginSubtitle")}
                  </p>
                </div>
                <LoginForm />
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

export function LoginGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading || isAuthenticated) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-6">
        <DestinationReady ready={false} />
        <div className="w-full max-w-lg space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      </main>
    );
  }

  return (
    <>
      <DestinationReady ready />
      {children}
    </>
  );
}
