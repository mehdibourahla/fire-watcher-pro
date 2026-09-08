import { beforeEach, expect, it, vi } from "vitest";

const { from, fcmSend, sendTelegram } = vi.hoisted(() => ({
  from: vi.fn(),
  fcmSend: vi.fn(async (_message: { topic: string }) => {}),
  sendTelegram: vi.fn(async (_chat: string, _html: string) => {}),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from },
}));
vi.mock("@/lib/ingest/fcm.server", () => ({
  fcmConfigured: () => true,
  fcmSend,
}));
vi.mock("@/lib/ingest/telegram.server", () => ({
  telegramConfigured: () => true,
  sendTelegram,
}));

import { deliverBroadcasts } from "@/lib/ingest/delivery.server";

function store(codes = ["1501", "1601", "1701"]) {
  const broadcast: Record<string, unknown> = {
    id: "b1",
    kind: "official",
    severity: "Severe",
    commune_codes: codes,
    push_codes: codes,
    cluster_id: null,
    cap_alert_id: "cap1",
    onm_vigilance_id: null,
    authority_warning_id: null,
    fcm_delivered_at: null,
    telegram_delivered_at: null,
  };
  const receipts: Record<string, unknown>[] = [];
  const state = {
    receiptReadError: false,
    receiptWriteError: false,
    completionError: false,
  };
  const data: Record<string, unknown> = {
    broadcast_settings: { enabled: true },
    broadcasts: [broadcast],
    broadcast_delivery_receipts: receipts,
    cap_alerts: [
      {
        id: "cap1",
        info: [
          {
            language: "fr-DZ",
            headline: "Protection Civile",
            description: "Feu signalé",
            parameter: [{ valueName: "source_key", value: "dgpc_telegram" }],
          },
        ],
      },
    ],
    telegram_channels: [15, 16, 17].map((n) => ({
      wilaya_id: `w${n}`,
      chat_id: `chat${n}`,
    })),
    admin_units: [15, 16, 17].map((n) => ({
      code: `${n}01`,
      parent_id: `w${n}`,
    })),
  };
  from.mockImplementation((table: string) => {
    const q: Record<string, unknown> = {};
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    let update: Record<string, unknown> | undefined;
    let receipt: Record<string, unknown> | undefined;
    for (const method of ["select", "order", "gte", "in", "range"])
      q[method] = () => q;
    q["eq"] = (key: string, value: unknown) => {
      if (table === "broadcasts" || table === "broadcast_delivery_receipts")
        filters.push((row) => row[key] === value);
      return q;
    };
    q["is"] = (key: string, value: unknown) => {
      filters.push((row) => row[key] === value);
      return q;
    };
    q["update"] = (value: Record<string, unknown>) => {
      update = value;
      return q;
    };
    q["upsert"] = (value: Record<string, unknown>) => {
      receipt = value;
      return q;
    };
    q["single"] = async () => ({ data: data[table], error: null });
    q["then"] = (resolve: (v: unknown) => unknown) => {
      if (
        (table === "broadcast_delivery_receipts" &&
          (receipt ? state.receiptWriteError : state.receiptReadError)) ||
        (update && state.completionError)
      )
        return Promise.resolve({
          data: null,
          error: { message: "database unavailable" },
        }).then(resolve);
      if (receipt) receipts.push(receipt);
      const rows = ((data[table] ?? []) as Record<string, unknown>[]).filter(
        (row) => filters.every((f) => f(row)),
      );
      if (update) for (const row of rows) Object.assign(row, update);
      return Promise.resolve({
        data: update || receipt ? null : rows,
        error: null,
      }).then(resolve);
    };
    return q;
  });
  return { broadcast, receipts, state };
}

beforeEach(() => {
  from.mockReset();
  fcmSend.mockReset();
  sendTelegram.mockReset();
});

it("retries only the failed Telegram chat and still attempts later chats", async () => {
  const { broadcast } = store();
  sendTelegram.mockImplementation(async (chat) => {
    if (chat === "chat16") throw new Error("rejected");
  });
  await expect(deliverBroadcasts()).rejects.toThrow("rejected");
  expect(sendTelegram.mock.calls.map((c) => c[0])).toEqual([
    "chat15",
    "chat16",
    "chat17",
  ]);
  expect(broadcast["telegram_delivered_at"]).toBeNull();
  expect(broadcast["fcm_delivered_at"]).not.toBeNull();
  sendTelegram.mockClear().mockResolvedValue(undefined);
  fcmSend.mockClear();
  await deliverBroadcasts();
  expect(sendTelegram.mock.calls.map((c) => c[0])).toEqual(["chat16"]);
  expect(fcmSend).not.toHaveBeenCalled();
  expect(broadcast["telegram_channels"]).toBe(3);
  sendTelegram.mockClear();
  await deliverBroadcasts();
  expect(sendTelegram).not.toHaveBeenCalled();
});

it("retries only the failed FCM topic without blocking Telegram", async () => {
  const { broadcast } = store();
  fcmSend.mockImplementation(async ({ topic }) => {
    if (topic === "v1.commune.1601.fr") throw new Error("FCM rejected");
  });
  await expect(deliverBroadcasts()).rejects.toThrow("FCM rejected");
  expect(fcmSend.mock.calls.map((c) => c[0].topic)).toEqual([
    "v1.commune.1501.fr",
    "v1.commune.1601.fr",
    "v1.commune.1701.fr",
  ]);
  expect(broadcast["telegram_delivered_at"]).not.toBeNull();
  fcmSend.mockClear().mockResolvedValue(undefined);
  sendTelegram.mockClear();
  await deliverBroadcasts();
  expect(fcmSend.mock.calls.map((c) => c[0].topic)).toEqual([
    "v1.commune.1601.fr",
  ]);
  expect(sendTelegram).not.toHaveBeenCalled();
  expect(broadcast["fcm_topics"]).toBe(3);
});

it("does not resend acknowledged destinations when the broadcast completion write fails", async () => {
  const { state } = store();
  state.completionError = true;
  await expect(deliverBroadcasts()).rejects.toThrow("database unavailable");
  state.completionError = false;
  fcmSend.mockClear();
  sendTelegram.mockClear();
  await deliverBroadcasts();
  expect(fcmSend).not.toHaveBeenCalled();
  expect(sendTelegram).not.toHaveBeenCalled();
});

it("resumes a broadcast larger than the FCM budget after its saved successes", async () => {
  const codes = Array.from({ length: 501 }, (_, i) => String(i + 1000));
  const { broadcast } = store(codes);
  await deliverBroadcasts();
  expect(fcmSend).toHaveBeenCalledTimes(500);
  expect(broadcast["fcm_delivered_at"]).toBeNull();
  fcmSend.mockClear();
  await deliverBroadcasts();
  expect(fcmSend.mock.calls.map((c) => c[0].topic)).toEqual([
    "v1.commune.1500.fr",
  ]);
  expect(broadcast["fcm_topics"]).toBe(501);
  expect(broadcast["fcm_delivered_at"]).not.toBeNull();
});

it("sends nothing when receipt history cannot be read", async () => {
  const { state } = store();
  state.receiptReadError = true;
  await expect(deliverBroadcasts()).rejects.toThrow("database unavailable");
  expect(fcmSend).not.toHaveBeenCalled();
  expect(sendTelegram).not.toHaveBeenCalled();
});

it("stops sending destinations when an acknowledged send cannot be persisted", async () => {
  const { state, broadcast } = store();
  state.receiptWriteError = true;
  await expect(deliverBroadcasts()).rejects.toThrow("database unavailable");
  expect(fcmSend).toHaveBeenCalledTimes(1);
  expect(broadcast["fcm_delivered_at"]).toBeNull();
});
