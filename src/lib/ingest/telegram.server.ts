export function telegramConfigured(): boolean {
  return Boolean(process.env["TELEGRAM_BOT_TOKEN"]);
}

export async function sendTelegram(
  chatId: string,
  html: string,
): Promise<void> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }),
  });
  if (!res.ok)
    throw new Error(
      `telegram send failed (${res.status}) for ${chatId}: ${(await res.text()).slice(0, 200)}`,
    );
}
