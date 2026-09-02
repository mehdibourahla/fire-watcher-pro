import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { watchdogTransition } from "@/lib/operator-alerts";
import type { SourceWatchdogIssue } from "@/lib/source-watchdog";

import { sendTelegram, telegramConfigured } from "./telegram.server";

const STATE_KEY = "source_watchdog";

export type OperatorAlertDependencies = {
  chatId: string | null;
  readIssues: () => Promise<SourceWatchdogIssue[]>;
  readFingerprint: () => Promise<string | null>;
  writeFingerprint: (fingerprint: string) => Promise<void>;
  send: (chatId: string, html: string) => Promise<void>;
};

const operatorAlertDependencies: OperatorAlertDependencies = {
  chatId:
    telegramConfigured() && process.env["NADHIR_OPERATOR_CHAT_ID"]
      ? (process.env["NADHIR_OPERATOR_CHAT_ID"] ?? null)
      : null,
  readIssues: async () => {
    const { data, error } = await supabaseAdmin
      .from("source_watchdog")
      .select(
        "contract_key, issue_code, scheduled_for, lease_expires_at, observed_at",
      );
    if (error) throw new Error(`watchdog query failed: ${error.message}`);
    return data ?? [];
  },
  readFingerprint: async () => {
    const { data, error } = await supabaseAdmin
      .from("operator_alert_state")
      .select("fingerprint")
      .eq("key", STATE_KEY)
      .maybeSingle();
    if (error) throw new Error(`alert state read failed: ${error.message}`);
    return data?.fingerprint ?? null;
  },
  writeFingerprint: async (fingerprint) => {
    const { error } = await supabaseAdmin.from("operator_alert_state").upsert({
      key: STATE_KEY,
      fingerprint,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`alert state write failed: ${error.message}`);
  },
  send: sendTelegram,
};

export async function notifyOperatorOnWatchdog(
  deps: OperatorAlertDependencies = operatorAlertDependencies,
): Promise<{ issues: number; notified: boolean }> {
  const issues = await deps.readIssues();
  if (!deps.chatId) {
    console.log(
      JSON.stringify({
        message: "operator alerts disabled: NADHIR_OPERATOR_CHAT_ID unset",
        issues: issues.length,
      }),
    );
    return { issues: issues.length, notified: false };
  }
  const previous = await deps.readFingerprint();
  const transition = watchdogTransition(previous, issues);
  if (transition.message === null)
    return { issues: issues.length, notified: false };
  await deps.send(deps.chatId, transition.message);
  await deps.writeFingerprint(transition.fingerprint);
  return { issues: issues.length, notified: true };
}
