import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  counts: new Map<string, number | null>(),
  reads: [] as string[],
  filters: [] as unknown[],
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      m.reads.push(table);
      const q = {
        select: () => q,
        eq: (...args: unknown[]) => {
          m.filters.push([table, ...args]);
          return q;
        },
        not: () => q,
        then: (resolve: (r: unknown) => unknown) =>
          Promise.resolve({
            count: m.counts.get(table) ?? 0,
            error:
              m.counts.get(table) === null ? new Error("unavailable") : null,
          }).then(resolve),
      };
      return q;
    },
  },
}));
import { readDeficits } from "@/lib/contribute.server";
import { LOCALES } from "@/i18n/locales-list";
beforeEach(() => {
  m.counts.clear();
  m.reads.length = 0;
  m.filters.length = 0;
});
it("counts only successful delivery evidence and selectable languages", async () => {
  m.counts.set("broadcast_delivery_receipts", 3);
  m.counts.set("webhook_deliveries", 2);
  m.counts.set("alerts", 99);
  const result = await readDeficits();
  expect(result.deliveryReceipts).toBe(5);
  expect(m.reads).not.toContain("alerts");
  expect(m.filters).toContainEqual(["webhook_deliveries", "ok", true]);
  expect(result.localesShipped).toBe(LOCALES.length);
});
it("shows unavailable rather than a false partial total", async () => {
  m.counts.set("broadcast_delivery_receipts", 3);
  m.counts.set("webhook_deliveries", null);
  expect((await readDeficits()).deliveryReceipts).toBe(-1);
});
