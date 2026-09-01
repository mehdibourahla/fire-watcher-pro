import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/integrations/supabase/types";
import { evaluateSourceWatchdog } from "../src/lib/source-watchdog";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!url || !key) {
  console.error("source-watchdog configuration is missing");
  process.exit(1);
}

const db = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await db
  .from("source_watchdog")
  .select(
    "contract_key, issue_code, scheduled_for, lease_expires_at, observed_at",
  );

if (error) {
  console.error("source-watchdog query failed");
  process.exit(1);
}

const result = evaluateSourceWatchdog(data ?? []);
for (const line of result.lines) console.log(line);
process.exitCode = result.exitCode;
