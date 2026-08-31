/* Verifies the broadcast delivery credentials against the live services.
 * Sends one real FCM message to a reserved no-subscriber topic. */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const eq = line.indexOf("=");
  if (eq <= 0 || line.startsWith("#")) continue;
  let value = line.slice(eq + 1).trim();
  if (value.startsWith('"')) {
    try {
      value = JSON.parse(value) as string;
    } catch {
      // leave the raw value; the check below reports what is unusable
    }
  }
  process.env[line.slice(0, eq)] = value;
}

const PREFLIGHT_TOPIC = "v1.commune.0000.en";
const results: { name: string; ok: boolean; detail: string }[] = [];

const record = async (name: string, run: () => Promise<string>) => {
  try {
    results.push({ name, ok: true, detail: await run() });
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
};

const { fcmConfigured, fcmSend, fcmSubscribeTopics } =
  await import("../src/lib/ingest/fcm.server");
const { telegramConfigured, sendTelegram } =
  await import("../src/lib/ingest/telegram.server");

if (!fcmConfigured()) {
  results.push({
    name: "FCM",
    ok: false,
    detail: "FIREBASE_SERVICE_ACCOUNT not set",
  });
} else {
  await record("FCM send", async () => {
    await fcmSend({
      topic: PREFLIGHT_TOPIC,
      notification: { title: "Nadhir preflight", body: "connectivity check" },
      webpush: { fcm_options: { link: "https://nadhir.app" } },
      data: { broadcast_id: "preflight", severity: "Severe", kind: "fire" },
    });
    return `accepted for ${PREFLIGHT_TOPIC}`;
  });

  // a rejected token must surface: the batch endpoint answers 200 either way
  await record("FCM topic subscribe rejects a bad token", async () => {
    let threw = false;
    try {
      await fcmSubscribeTopics(
        "PREFLIGHT_NOT_A_TOKEN",
        [PREFLIGHT_TOPIC],
        true,
      );
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("a bogus token was accepted — silent failure");
    return "rejected as expected";
  });
}

if (!telegramConfigured()) {
  results.push({
    name: "Telegram",
    ok: false,
    detail: "TELEGRAM_BOT_TOKEN not set",
  });
} else {
  await record("Telegram auth", async () => {
    const res = await fetch(
      `https://api.telegram.org/bot${process.env["TELEGRAM_BOT_TOKEN"]}/getMe`,
    );
    const body = (await res.json()) as {
      ok: boolean;
      result?: { username?: string };
      description?: string;
    };
    if (!body.ok) throw new Error(body.description ?? "getMe failed");
    return `bot @${body.result?.username ?? "unknown"}`;
  });

  const chat = process.env["TELEGRAM_PREFLIGHT_CHAT_ID"];
  if (chat)
    await record("Telegram send", async () => {
      await sendTelegram(chat, "<b>Nadhir preflight</b>\n\nconnectivity check");
      return `posted to ${chat}`;
    });
}

for (const r of results)
  console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name} — ${r.detail}`);

process.exit(results.some((r) => !r.ok) ? 1 : 0);
