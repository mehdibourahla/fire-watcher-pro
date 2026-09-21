import { beforeEach, expect, it, vi } from "vitest";

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from } }));
import {
  acknowledgeIncident,
  setDeliveryChannelPaused,
  sourceHealthQuery,
} from "../admin-sources";

beforeEach(() => rpc.mockReset());
it("shows quarantined processing as degraded in admin health and fails on unavailable processing", async () => {
  from.mockImplementation((table: string) => ({
    select: async () => ({
      error: null,
      data:
        table === "source_contracts"
          ? [{ key: "ita_website", enabled: true }]
          : [{ key: "ita_website", state: "healthy" }],
    }),
  }));
  rpc.mockResolvedValue({
    error: null,
    data: [
      { key: "ita_website", pending: 0, quarantined: 1, collection_at: null },
    ],
  });
  const query = sourceHealthQuery.queryFn as () => Promise<unknown>;
  expect(await query()).toEqual([
    expect.objectContaining({ state: "degraded", enabled: true }),
  ]);
  rpc.mockResolvedValue({
    error: { message: "processing unavailable" },
    data: null,
  });
  await expect(query()).rejects.toThrow("processing unavailable");
});
it("uses the secured channel and incident operations", async () => {
  rpc.mockResolvedValue({ error: null });
  await setDeliveryChannelPaused("telegram", true);
  expect(rpc).toHaveBeenCalledWith("set_delivery_channel_paused", {
    _channel: "telegram",
    _paused: true,
  });
  await acknowledgeIncident("incident");
  expect(rpc).toHaveBeenCalledWith("acknowledge_operational_incident", {
    _id: "incident",
  });
});
it("surfaces mutation errors without claiming success", async () => {
  rpc.mockResolvedValue({ error: { message: "permission denied" } });
  await expect(setDeliveryChannelPaused("fcm", false)).rejects.toThrow(
    "permission denied",
  );
  await expect(acknowledgeIncident("incident")).rejects.toThrow(
    "permission denied",
  );
});
