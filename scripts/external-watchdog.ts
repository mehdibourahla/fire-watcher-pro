import { createClient } from "@supabase/supabase-js";

import { externalWatchdogIssues } from "../src/lib/external-watchdog";
import { watchdogTransition } from "../src/lib/operator-alerts";
import type { SourceWatchdogIssue } from "../src/lib/source-watchdog";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const STATE_KEY = "external_watchdog";
const supabase = createClient(url, key, { auth: { persistSession: false } });

function must<T>(result: {
  data: T | null;
  error: { message: string } | null;
}) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

const [issuesResult, contracts] = await Promise.all([
  supabase
    .from("source_watchdog")
    .select(
      "contract_key, issue_code, scheduled_for, lease_expires_at, observed_at",
    ),
  supabase
    .from("source_contracts")
    .select("key")
    .eq("execution_target", "cloudflare")
    .eq("enabled", true)
    .eq("schedule_enabled", true),
]);
const viewIssues = (must(issuesResult) ?? []) as SourceWatchdogIssue[];
const keys = (must(contracts) ?? []).map((c) => c.key);

const lastRun = must(
  await supabase
    .from("source_runs")
    .select("started_at")
    .in("contract_key", keys)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle(),
);

const issues = externalWatchdogIssues({
  viewIssues,
  lastWorkerRunAt: lastRun?.started_at ?? null,
  now: Date.now(),
});

const previous = must(
  await supabase
    .from("operator_alert_state")
    .select("fingerprint")
    .eq("key", STATE_KEY)
    .maybeSingle(),
);
const transition = watchdogTransition(previous?.fingerprint ?? null, issues);
console.log(
  JSON.stringify({
    message: "external watchdog",
    issues: issues.length,
    lastWorkerRunAt: lastRun?.started_at ?? null,
    notify: transition.message !== null,
  }),
);
if (transition.message === null) process.exit(0);

const token = process.env["TELEGRAM_BOT_TOKEN"];
const chatId = process.env["NADHIR_OPERATOR_CHAT_ID"];
if (token && chatId) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: transition.message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) throw new Error(`telegram ${res.status}`);
} else {
  // a watchdog whose alert cannot leave the runner must not report success
  console.error(
    "::error::operator DM unsent: TELEGRAM_BOT_TOKEN or NADHIR_OPERATOR_CHAT_ID is not a repository secret",
  );
  console.error(transition.message);
  process.exit(1);
}

const written = await supabase.from("operator_alert_state").upsert({
  key: STATE_KEY,
  fingerprint: transition.fingerprint,
  updated_at: new Date().toISOString(),
});
if (written.error) throw new Error(written.error.message);
