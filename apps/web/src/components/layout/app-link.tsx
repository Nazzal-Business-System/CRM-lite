"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import {
  isSameAppPath,
  useNavigationStore,
} from "@/stores/navigation-store";
import { cn } from "@/lib/utils";

type AppLinkProps = LinkProps & {
  children: ReactNode;
  className?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export function AppLink({
  href,
  onClick,
  className,
  children,
  ...props
}: AppLinkProps) {
  const pathname = usePathname();
  const start = useNavigationStore((state) => state.start);
  const pendingHref = useNavigationStore((state) => state.pendingHref);
  const target = String(href);
  const pending = pendingHref === target || pendingHref === target.split("?")[0];

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    if (isSameAppPath(pathname, target)) {
      return;
    }

    start(target);
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={cn(pending && "opacity-80", className)}
      {...props}
    >
      {children}
    </Link>
  );
}
