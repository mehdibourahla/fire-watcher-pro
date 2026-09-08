import { beforeEach, expect, it, vi } from "vitest";

const { from, sendTelegram } = vi.hoisted(() => ({
  from: vi.fn(),
  sendTelegram: vi.fn(async () => {}),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from },
}));
vi.mock("@/lib/ingest/telegram.server", () => ({
  telegramConfigured: () => true,
  sendTelegram,
}));
vi.mock("@/lib/ingest/fcm.server", () => ({
  fcmConfigured: () => false,
}));

import { deliverBroadcasts } from "@/lib/ingest/delivery.server";
import { publishBroadcasts } from "@/lib/ingest/broadcast.server";

function fixture(
  kind: string,
  sourceKey: string | null = "dgpc_telegram",
  pushCodes = ["1501"],
) {
  const writes: unknown[] = [];
  const data: Record<string, unknown> = {
    broadcast_settings: { enabled: true },
    broadcasts: [
      {
        id: "b1",
        kind,
        severity: "Severe",
        commune_codes: ["1501"],
        push_codes: pushCodes,
        cluster_id: "f1",
        cap_alert_id: "cap1",
        onm_vigilance_id: "onm1",
        authority_warning_id: "w1",
        official_incident_id: "i1",
      },
    ],
    cap_alerts: [
      {
        id: "cap1",
        info: [
          {
            language: "fr-DZ",
            headline: "Protection Civile",
            description: "Feu signalé",
            parameter:
              sourceKey === null
                ? undefined
                : [{ valueName: "source_key", value: sourceKey }],
          },
        ],
      },
    ],
    fire_clusters: [{ id: "f1", short_id: "DZ123" }],
    onm_vigilance: [{ id: "onm1", title: "Wind warning", headline_fr: null }],
    authority_warnings: [
      { id: "w1", source: "Protection Civile", body: "Manual warning" },
    ],
    official_incidents: [
      {
        id: "i1",
        incident_mentions: { text_sources: { key: "dgpc_telegram" } },
      },
    ],
    telegram_channels: [{ wilaya_id: "w15", chat_id: "chat15" }],
    admin_units: [{ code: "1501", parent_id: "w15" }],
  };
  from.mockImplementation((table: string) => {
    const q: Record<string, unknown> = {};
    let update = false;
    for (const method of [
      "select",
      "eq",
      "in",
      "is",
      "gte",
      "order",
      "range",
      "upsert",
    ])
      q[method] = () => q;
    q["update"] = (value: unknown) => {
      writes.push(value);
      update = true;
      return q;
    };
    q["single"] = async () => ({ data: data[table], error: null });
    q["then"] = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: update ? null : (data[table] ?? []),
        error: null,
      }).then(resolve);
    return q;
  });
  return writes;
}

beforeEach(() => {
  from.mockReset();
  sendTelegram.mockClear();
});

it.each(["fire", "onm", "authority", "unknown"])(
  "does not send %s broadcasts to Telegram and drains the pending row",
  async (kind) => {
    const writes = fixture(kind);
    const result = await deliverBroadcasts();
    expect(sendTelegram).not.toHaveBeenCalled();
    expect(result.telegramSent).toBe(0);
    expect(writes).toContainEqual({
      telegram_channels: 0,
      telegram_delivered_at: expect.any(String),
    });
  },
);

it.each(["dgpc_telegram", "other_authority", "", null])(
  "checks registered provenance for official incidents: %s",
  async (key) => {
    fixture("official", key);
    await deliverBroadcasts();
    expect(sendTelegram).toHaveBeenCalledTimes(key === "dgpc_telegram" ? 1 : 0);
  },
);

it("relays Protection Civile even when satellite coverage suppressed FCM push codes", async () => {
  fixture("official", "dgpc_telegram", []);
  await deliverBroadcasts();
  expect(sendTelegram).toHaveBeenCalledWith(
    "chat15",
    "<b>Protection Civile</b>\n\nFeu signalé",
  );
});

it("publishes an official relay under satellite coverage without a duplicate FCM push", async () => {
  const inserted: Record<string, unknown>[] = [];
  const caps: Record<string, unknown>[] = [];
  const data: Record<string, unknown> = {
    broadcast_settings: { enabled: true },
    broadcasts: [
      {
        cluster_id: "f1",
        phase: "initial",
        severity: "Severe",
        commune_codes: ["1501"],
        inside_codes: ["1501"],
        created_at: new Date().toISOString(),
        official_incident_id: null,
      },
    ],
    fire_clusters: [],
    onm_vigilance: [],
    authority_warnings: [],
    official_incidents: [
      {
        id: "i1",
        commune_id: "c1",
        wilaya_id: "w15",
        status: "active",
        as_of: new Date().toISOString(),
        evidence: "Bulletin",
        unlisted_at: null,
        latest_mention_id: "m1",
      },
    ],
    admin_units: [
      {
        id: "c1",
        code: "1501",
        name_fr: "Azazga",
        name_ar: "عزازقة",
        name_en: "Azazga",
        name_kab: "Azazga",
      },
    ],
    incident_mentions: [
      {
        id: "m1",
        text_sources: { label: "Protection Civile", key: "dgpc_telegram" },
      },
    ],
  };
  from.mockImplementation((table: string) => {
    const q: Record<string, unknown> = {};
    let insert = false;
    for (const method of [
      "select",
      "eq",
      "neq",
      "in",
      "is",
      "not",
      "or",
      "gte",
      "order",
      "range",
    ])
      q[method] = () => q;
    q["insert"] = (value: Record<string, unknown>) => {
      if (table === "broadcasts") inserted.push(value);
      if (table === "cap_alerts") caps.push(value);
      insert = true;
      return q;
    };
    q["single"] = async () => ({
      data: insert ? { id: "new1" } : data[table],
      error: null,
    });
    q["then"] = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: insert ? null : (data[table] ?? []),
        error: null,
      }).then(resolve);
    return q;
  });
  await publishBroadcasts();
  expect(caps).toContainEqual(
    expect.objectContaining({
      info: expect.arrayContaining([
        expect.objectContaining({
          parameter: [{ valueName: "source_key", value: "dgpc_telegram" }],
        }),
      ]),
    }),
  );
  expect(inserted).toContainEqual(
    expect.objectContaining({
      kind: "official",
      official_incident_id: "i1",
      commune_codes: ["1501"],
      push_codes: [],
    }),
  );
});
