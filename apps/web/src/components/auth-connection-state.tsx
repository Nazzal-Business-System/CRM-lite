"use client";

import { LoaderCircle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useI18n } from "@/i18n/provider";

export function AuthConnectionState({ failed, retry }: { failed: boolean; retry: () => void }) {
  const { t, dir } = useI18n();
  return (
    <main dir={dir} className="flex min-h-svh items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mb-10 flex justify-end"><LanguageSwitcher /></div>
        <div role={failed ? "alert" : "status"} aria-live="polite" aria-atomic="true">
          <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            {failed ? <WifiOff aria-hidden="true" className="size-6" /> : <LoaderCircle aria-hidden="true" className="size-6 animate-spin motion-reduce:animate-none" />}
          </div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">NBS CRM</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t(failed ? "auth.connectionTitle" : "auth.connecting")}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t(failed ? "auth.connectionError" : "auth.connectingDescription")}</p>
        </div>
        {failed && <Button type="button" className="mt-6 min-w-32" onClick={retry}>{t("common.retry")}</Button>}
      </div>
    </main>
  );
}
