export const PAGE_SIZE = 1000;

type Page = {
  data: unknown[] | null;
  error: { message: string } | null;
};

/**
 * PostgREST caps a response at 1000 rows. Algeria has 1537 communes and ~10k
 * settlements, so any unpaged select over those tables silently truncates.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<Page>,
  maxPages = 40,
): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; i < maxPages; i += 1) {
    const { data, error } = await page(
      i * PAGE_SIZE,
      i * PAGE_SIZE + PAGE_SIZE - 1,
    );
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
  return all;
}
