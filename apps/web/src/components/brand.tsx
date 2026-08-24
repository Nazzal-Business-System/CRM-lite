"use client";

import Image from "next/image";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/** Keep brand assets LTR so logos are never mirrored in RTL layouts. */
function BrandFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span dir="ltr" className={cn("inline-flex items-center", className)}>
      {children}
    </span>
  );
}

export function BrandMark({
  className,
  alt,
}: {
  className?: string;
  alt?: string;
}) {
  const { t } = useI18n();

  return (
    <BrandFrame>
      <Image
        src="/brand/nbs-mark.png"
        alt={alt ?? t("brand.markAlt")}
        width={320}
        height={128}
        className={cn("h-8 w-auto object-contain object-left", className)}
        priority
      />
    </BrandFrame>
  );
}

export function BrandLockup({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <BrandFrame className={className}>
      <Image
        src={compact ? "/brand/nbs-lockup-compact.png" : "/brand/nbs-lockup.png"}
        alt={t("brand.lockupAlt")}
        width={compact ? 640 : 1280}
        height={compact ? 240 : 480}
        className={cn(
          "hidden object-contain object-left mix-blend-screen dark:block",
          compact ? "h-9 w-auto max-w-[168px]" : "h-16 w-auto max-w-[280px]",
        )}
        priority
      />
      <span className="flex items-center gap-2.5 dark:hidden">
        <Image
          src="/brand/nbs-mark.png"
          alt={t("brand.markAlt")}
          width={320}
          height={128}
          className={cn(
            "w-auto object-contain object-left",
            compact ? "h-7" : "h-10",
          )}
          priority
        />
        <span className="min-w-0">
          <span className="block text-[11px] font-medium tracking-[0.16em] text-muted-foreground">
            {t("brand.crm")}
          </span>
        </span>
      </span>
    </BrandFrame>
  );
}

export function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n();

  if (collapsed) {
    return (
      <BrandFrame>
        <Image
          src="/brand/nbs-mark.png"
          alt={t("brand.sidebarAlt")}
          width={160}
          height={64}
          className="h-8 w-auto max-w-[52px] object-contain dark:hidden"
          priority
        />
        <Image
          src="/brand/nbs-mark-white.png"
          alt={t("brand.sidebarAlt")}
          width={160}
          height={64}
          className="hidden h-8 w-auto max-w-[52px] object-contain mix-blend-screen dark:block"
          priority
        />
      </BrandFrame>
    );
  }

  return <BrandLockup compact />;
}

export function LoginBrand() {
  const { t } = useI18n();

  return (
    <BrandFrame className="gap-3">
      <BrandMark className="h-8" />
      <span className="text-sm text-muted-foreground">{t("brand.company")}</span>
    </BrandFrame>
  );
}
