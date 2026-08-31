import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { enqueueDueSourceJobs } from "./source-jobs.server";

export type SourceSchedulerConfig = {
  NADHIR_APP_URL: string;
  NADHIR_CRON_SECRET: string;
};

export type SourceSchedulerResult = {
  enqueued: number;
  dispatched: number;
  failed: number;
};

export type EnqueueScheduledSources = (
  observedAt: string,
  enqueuedBy: "cloudflare",
) => Promise<number>;

const enqueueScheduledSources: EnqueueScheduledSources = (
  observedAt,
  enqueuedBy,
) => enqueueDueSourceJobs(supabaseAdmin, observedAt, enqueuedBy);

export function sourceSchedulerConfig(env: unknown): SourceSchedulerConfig {
  if (env === null || typeof env !== "object")
    throw new Error("Missing source scheduler environment");

  const appUrl = Reflect.get(env, "NADHIR_APP_URL");
  const secret = Reflect.get(env, "NADHIR_CRON_SECRET");
  if (typeof appUrl !== "string" || !appUrl.startsWith("https://"))
    throw new Error("NADHIR_APP_URL must be an HTTPS URL");
  if (typeof secret !== "string" || secret.length === 0)
    throw new Error("NADHIR_CRON_SECRET is not configured");

  return { NADHIR_APP_URL: appUrl, NADHIR_CRON_SECRET: secret };
}

export async function dispatchScheduledSources(
  scheduledTime: number,
  env: SourceSchedulerConfig,
  fetchImpl: typeof fetch = fetch,
  enqueue: EnqueueScheduledSources = enqueueScheduledSources,
): Promise<SourceSchedulerResult> {
  const observedAt = new Date(scheduledTime).toISOString();
  const enqueued = await enqueue(observedAt, "cloudflare");
  const endpoint = new URL("/api/internal/source-jobs/run", env.NADHIR_APP_URL);
  const requests = Array.from({ length: 4 }, () =>
    fetchImpl(endpoint.toString(), {
      method: "POST",
      headers: { authorization: `Bearer ${env.NADHIR_CRON_SECRET}` },
    }),
  );
  const settled = await Promise.allSettled(requests);
  const dispatched = settled.filter(
    (result) => result.status === "fulfilled" && result.value.ok,
  ).length;
  const failed = settled.length - dispatched;

  if (dispatched === 0) throw new Error("All source job dispatches failed");
  return { enqueued, dispatched, failed };
}
