"use client";

import type { ReactNode } from "react";
import { BrandLockup, LoginBrand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { DestinationReady } from "@/components/layout/destination-ready";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/providers/auth-provider";

export function LoginScreen() {
  const { t } = useI18n();

  const signals = [
    {
      label: t("auth.signalIntelligence"),
      detail: t("auth.signalIntelligenceHint"),
    },
    {
      label: t("auth.signalResearch"),
      detail: t("auth.signalResearchHint"),
    },
    {
      label: t("auth.signalOpportunities"),
      detail: t("auth.signalOpportunitiesHint"),
    },
    {
      label: t("auth.signalFollowUps"),
      detail: t("auth.signalFollowUpsHint"),
    },
  ] as const;

  return (
    <main className="relative min-h-svh bg-background">
      <div className="relative mx-auto flex min-h-svh w-full max-w-[1080px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between py-1">
          <LoginBrand />
          <div className="flex items-center gap-1.5">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        <div className="flex flex-1 items-center py-8 sm:py-10">
          <div className="grid w-full overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_50px_oklch(0.2_0.03_255_/_0.08)] lg:grid-cols-[1.05fr_0.95fr]">
            <section className="hidden flex-col justify-between bg-[#05070c] px-10 py-10 text-white lg:flex lg:min-h-[540px] lg:px-12 lg:py-12">
              <BrandLockup className="h-20 max-w-[320px]" />
              <div>
                <p className="text-sm text-white/60">{t("auth.panelEyebrow")}</p>
                <p className="mt-4 max-w-sm text-[17px] leading-7 text-white/72">
                  {t("auth.panelTitle")}
                </p>
              </div>
              <ul className="grid grid-cols-2 gap-3">
                {signals.map((item) => (
                  <li key={item.label} className="rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <p className="mt-1 text-sm leading-5 text-white/60">{item.detail}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col justify-center px-5 py-8 sm:px-8 sm:py-10 lg:px-12">
              <div className="mb-8 lg:hidden">
                <BrandLockup compact />
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {t("auth.panelTagline")}
                </p>
              </div>
              <div className="mx-auto w-full max-w-[400px] lg:mx-0 lg:max-w-none">
                <div className="mb-8 space-y-2">
                  <h1 className="text-[1.65rem] font-semibold tracking-[-0.03em]">
                    {t("auth.loginTitle")}
                  </h1>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t("auth.loginSubtitle")}
                  </p>
                </div>
                <LoginForm />
              </div>
            </section>
          </div>
        </div>

        <footer className="pb-[max(0.25rem,env(safe-area-inset-bottom))] text-sm text-muted-foreground">
          {t("auth.footer")}
        </footer>
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
