import type {
  ContactDetail,
  ContactSummary,
  PaginatedResult,
} from "@nbs/shared";
import type { QueryClient } from "@tanstack/react-query";

export function cacheContact(
  queryClient: QueryClient,
  contact: ContactDetail,
): void {
  queryClient.setQueryData(["contact", contact.id], { contact });
  queryClient.setQueriesData<PaginatedResult<ContactSummary>>(
    { queryKey: ["contacts"] },
    (current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === contact.id ? contact : item,
            ),
          }
        : current,
  );
}

export function removeContactFromCache(
  queryClient: QueryClient,
  contactId: string,
): void {
  queryClient.removeQueries({ queryKey: ["contact", contactId], exact: true });
  queryClient.setQueriesData<PaginatedResult<ContactSummary>>(
    { queryKey: ["contacts"] },
    (current) => {
      if (!current || !current.items.some((item) => item.id === contactId)) {
        return current;
      }
      return {
        ...current,
        items: current.items.filter((item) => item.id !== contactId),
        total: Math.max(0, current.total - 1),
      };
    },
  );
}

export async function refreshContactCollections(
  queryClient: QueryClient,
  companyIds: Array<string | null | undefined>,
): Promise<void> {
  const uniqueCompanyIds = [...new Set(companyIds.filter(Boolean) as string[])];
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["contacts"] }),
    queryClient.invalidateQueries({ queryKey: ["contact-options"] }),
    queryClient.invalidateQueries({ queryKey: ["opportunities"] }),
    queryClient.invalidateQueries({ queryKey: ["activities"] }),
    queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    ...uniqueCompanyIds.map((companyId) =>
      queryClient.invalidateQueries({ queryKey: ["company", companyId] }),
    ),
  ]);
}
