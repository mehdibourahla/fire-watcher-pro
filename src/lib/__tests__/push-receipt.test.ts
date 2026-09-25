import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {},
}));

import { pushReceipt, recordPushReceipt } from "@/lib/push-receipt.server";

const secret = "test-secret";
const alertId = "0b000000-0000-4000-8000-000000000001";
const other = "0b000000-0000-4000-8000-000000000002";

function deps() {
  const marked: string[] = [];
  return {
    marked,
    deps: {
      secret: () => secret,
      mark: async (id: string) => {
        marked.push(id);
      },
    },
  };
}

describe("push receipts", () => {
  it("marks the alert a device received", async () => {
    const { marked, deps: d } = deps();
    const receipt = await pushReceipt(alertId, secret);
    await expect(
      recordPushReceipt({ alert_id: alertId, receipt }, d),
    ).resolves.toBe("recorded");
    expect(marked).toEqual([alertId]);
  });

  it("refuses a forged receipt or one signed for another alert", async () => {
    const { marked, deps: d } = deps();
    const forOther = await pushReceipt(other, secret);
    const wrongKey = await pushReceipt(alertId, "someone-else");
    await expect(
      recordPushReceipt({ alert_id: alertId, receipt: forOther }, d),
    ).resolves.toBe("forged");
    await expect(
      recordPushReceipt({ alert_id: alertId, receipt: wrongKey }, d),
    ).resolves.toBe("forged");
    expect(marked).toEqual([]);
  });

  it("refuses anything but an alert id and its receipt", async () => {
    const { marked, deps: d } = deps();
    const receipt = await pushReceipt(alertId, secret);
    for (const body of [
      null,
      "x",
      { alert_id: alertId },
      { alert_id: "not-a-uuid", receipt },
      { alert_id: alertId, receipt, extra: 1 },
    ])
      await expect(recordPushReceipt(body, d)).resolves.toBe("invalid");
    expect(marked).toEqual([]);
  });
});
