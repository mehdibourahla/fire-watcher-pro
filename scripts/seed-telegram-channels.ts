import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const botToken = process.env["TELEGRAM_BOT_TOKEN"];
if (!url || !key || !botToken) {
  console.error(
    "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and TELEGRAM_BOT_TOKEN.",
  );
  process.exit(1);
}

const mappingPath = process.argv[2] ?? "data/telegram-channels.json";
const mapping = JSON.parse(readFileSync(mappingPath, "utf8")) as Record<
  string,
  string
>;
const entries = Object.entries(mapping);
if (!entries.length) {
  console.error(
    `${mappingPath} is empty — expected { "18": "@channel" } or { "*": "@channel" }.`,
  );
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function telegram<T>(method: string, params: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as {
    ok: boolean;
    result?: T;
    description?: string;
  };
  if (!body.ok) throw new Error(body.description ?? `${method} failed`);
  return body.result as T;
}

const me = await telegram<{ id: number; username: string }>("getMe", {});
console.log(`bot @${me.username}`);

const { data: wilayas, error } = await db
  .from("admin_units")
  .select("id, code, name_fr")
  .eq("level", "wilaya");
if (error) throw new Error(error.message);
const byCode = new Map((wilayas ?? []).map((w) => [w.code, w]));

const rows: { wilaya_id: string; chat_id: string }[] = [];
let failed = 0;

// "*" is a national channel: every wilaya points at the same chat, and delivery
// dedupes so a multi-wilaya alert still posts once
const expanded = entries.flatMap(([code, channel]) =>
  code === "*"
    ? (wilayas ?? []).map((w) => [w.code, channel] as [string, string])
    : [[code, channel] as [string, string]],
);

for (const [code, channel] of expanded) {
  const wilaya = byCode.get(code);
  if (!wilaya) {
    console.log(`FAIL ${code} — no wilaya with that code`);
    failed += 1;
    continue;
  }
  try {
    const chat = await telegram<{ id: number; title?: string }>("getChat", {
      chat_id: channel,
    });
    const member = await telegram<{
      status: string;
      can_post_messages?: boolean;
    }>("getChatMember", { chat_id: chat.id, user_id: me.id });
    if (member.status !== "administrator" && member.status !== "creator")
      throw new Error(`bot is "${member.status}", not an administrator`);
    if (member.status === "administrator" && !member.can_post_messages)
      throw new Error("bot cannot post messages in this channel");

    // store the numeric id: it survives a channel being renamed
    rows.push({ wilaya_id: wilaya.id, chat_id: String(chat.id) });
    console.log(
      `ok   ${code} ${wilaya.name_fr} -> ${chat.title ?? channel} (${chat.id})`,
    );
  } catch (e) {
    console.log(
      `FAIL ${code} ${wilaya.name_fr} ${channel} — ${e instanceof Error ? e.message : e}`,
    );
    failed += 1;
  }
}

if (failed) {
  console.error(`\n${failed} channel(s) unusable — nothing written.`);
  process.exit(1);
}

const { error: upsertError } = await db
  .from("telegram_channels")
  .upsert(rows, { onConflict: "wilaya_id" });
if (upsertError) throw new Error(upsertError.message);
console.log(`\nSeeded ${rows.length} wilaya channels.`);
