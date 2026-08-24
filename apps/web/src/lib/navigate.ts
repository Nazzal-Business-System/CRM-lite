import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  isSameAppPath,
  useNavigationStore,
} from "@/stores/navigation-store";

export function navigateTo(
  router: AppRouterInstance,
  href: string,
  currentPathname: string,
  replace = false,
): void {
  if (!isSameAppPath(currentPathname, href)) {
    useNavigationStore.getState().start(href);
  }

  if (replace) {
    router.replace(href);
    return;
  }

  router.push(href);
}
