import { beforeEach, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import {
  acknowledgeIncident,
  setDeliveryChannelPaused,
} from "../admin-sources";

beforeEach(() => rpc.mockReset());
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
