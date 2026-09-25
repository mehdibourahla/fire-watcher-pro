import { type InfiniteData } from "@tanstack/react-query";

export const PAGE_SIZE = 25;

export const firstPage = 0;

export function nextOffset<T>(last: T[], pages: T[][]) {
  return last.length < PAGE_SIZE ? null : pages.length * PAGE_SIZE;
}

export const pageRange = (offset: number) =>
  [offset, offset + PAGE_SIZE - 1] as const;

// a row inserted above a loaded page shifts the next page by one; keep its first copy
export function pageRows<T extends { id: string }>(
  data: InfiniteData<T[]> | undefined,
): T[] {
  const seen = new Set<string>();
  return (data?.pages ?? []).flat().filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}
