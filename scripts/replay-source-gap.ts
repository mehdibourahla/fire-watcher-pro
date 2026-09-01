import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/integrations/supabase/types";
import {
  runReplayCommand,
  type ReplayClientFactory,
} from "../src/lib/replay-source-gap";

const createReplayClient: ReplayClientFactory = (url, key) =>
  createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function main() {
  try {
    process.exitCode = await runReplayCommand(
      process.argv.slice(2),
      process.env,
      createReplayClient,
      console.log,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Replay failed");
    process.exitCode = 1;
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) await main();
