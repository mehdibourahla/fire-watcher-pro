import { SEVERITY } from "./alerts-rules";

export type TelegramAlertPayload = {
  id: string;
  kind: string;
  severity: number;
  title: string;
  body: string;
  distance_km: number | null;
  payload?: {
    short_id?: string;
    settlement?: string;
    confidence?: number;
    state?: string;
  } | null;
  cap_identifier?: string | null;
};

/**
 * Formats an alert into an actionable, bilingual Telegram HTML message.
 */
export function formatTelegramAlertHtml(
  alert: TelegramAlertPayload,
  appUrl = "https://nadhir.app",
): string {
  const isEmergency = alert.severity >= SEVERITY.emergency;
  const header = isEmergency
    ? "🚨 <b>نذير | تنبيه حريق عاجل (NADHIR EMERGENCY)</b>"
    : "⚠️ <b>نذير | إشعار نشاط حريق (Nadhir Wildfire Notice)</b>";

  const fireLink = alert.payload?.short_id
    ? `${appUrl}/#fire-${alert.payload.short_id}`
    : `${appUrl}/survival`;

  const lines = [
    header,
    "",
    `📌 <b>${alert.title}</b>`,
    alert.body,
    "",
    alert.payload?.settlement
      ? `🏘️ <b>أقرب تجمع سكني:</b> ${alert.payload.settlement}`
      : "",
    alert.distance_km !== null
      ? `📏 <b>المسافة:</b> ${alert.distance_km.toFixed(1)} كم`
      : "",
    alert.payload?.confidence !== undefined
      ? `🛰️ <b>ثقة الرصد عبر الأقمار الاصطناعية:</b> ${Math.round(alert.payload.confidence * 100)}%`
      : "",
    "",
    "📞 <b>في حال الخطر المباشر:</b> اتصل بالحماية المدنية على <b>14</b>.",
    "🚫 تجنب التوجه نحو مسار الدخان وافسح الطريق لفرق الإسعاف.",
    "",
    `🌐 <a href="${fireLink}">فتح خريطة المتابعة والتوجيه في نذير</a>`,
  ].filter(Boolean);

  return lines.join("\n");
}

/**
 * Sends a message via Telegram Bot API.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string | number,
  htmlText: string,
): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const json = (await res.json()) as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };
    if (json.ok && json.result) {
      return { ok: true, messageId: json.result.message_id };
    }
    return { ok: false, error: json.description ?? `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "telegram send failed",
    };
  }
}

/**
 * Dispatches active alerts to Telegram broadcast channels or subscribers.
 */
export async function dispatchTelegramAlerts(
  alerts: TelegramAlertPayload[],
  botToken = process.env["TELEGRAM_BOT_TOKEN"],
  channelId = process.env["TELEGRAM_CHANNEL_ID"],
): Promise<{ sent: number; failed: number }> {
  if (!botToken || !channelId || !alerts.length) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const alert of alerts) {
    const text = formatTelegramAlertHtml(alert);
    const result = await sendTelegramMessage(botToken, channelId, text);
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
      console.warn(
        `[telegram] delivery failed for alert ${alert.id}:`,
        result.error,
      );
    }
  }

  return { sent, failed };
}
