export type SortSelection = `${string}:${"asc" | "desc"}`;

export function sortParams(selection: SortSelection): {
  sort: string;
  order: "asc" | "desc";
} {
  const separator = selection.lastIndexOf(":");
  return {
    sort: selection.slice(0, separator),
    order: selection.slice(separator + 1) as "asc" | "desc",
  };
}
