"use client";

import Image from "next/image";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

const OFFICIAL_NBS_LOGO = "/brand/NBS-logo.png";

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

export function NbsLogo({
  className,
  alt,
  priority = true,
}: {
  className?: string;
  alt?: string;
  priority?: boolean;
}) {
  const { t } = useI18n();

  return (
    <BrandFrame>
      <Image
        src={OFFICIAL_NBS_LOGO}
        alt={alt ?? t("brand.lockupAlt")}
        width={1254}
        height={1254}
        className={cn(
          "block size-48 shrink-0 rounded-lg bg-[#05070c] object-contain",
          className,
        )}
        priority={priority}
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
  return <NbsLogo className={cn(compact ? "size-24" : "size-48", className)} />;
}

export function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n();

  if (collapsed) {
    return (
      <BrandFrame className="size-10 justify-center rounded-lg bg-[#05070c] text-[13px] font-semibold tracking-[-0.04em] text-white ring-1 ring-white/10">
        <span role="img" aria-label={t("brand.sidebarAlt")}>
          NB<span className="text-[#7584ff]">S</span>
        </span>
      </BrandFrame>
    );
  }

  return <NbsLogo className="size-24" alt={t("brand.sidebarAlt")} />;
}
