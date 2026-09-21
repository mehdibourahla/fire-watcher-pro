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

export function watchdogDue(scheduledTime: number): boolean {
  return new Date(scheduledTime).getUTCMinutes() % 5 === 0;
}

/* The queue gates a job on its dependencies, so a wave of parallel claims only ever
 * advances the chain one stage: ingest, screen, fuse, publish, deliver took five
 * minutes of wall clock. Waves let one Cron Event drain the whole chain. */
export const DISPATCH_WAVES = 5;
export const DISPATCH_PARALLEL = 2;
export const DISPATCH_BUDGET_MS = 20_000;
// Reserve sixty seconds for cleanup before the fifteen-minute Cron runtime ceiling.
const DISPATCH_TIMEOUT_MS = 840_000;

export async function dispatchScheduledSources(
  scheduledTime: number,
  env: SourceSchedulerConfig,
  fetchImpl: typeof fetch = fetch,
  enqueue: EnqueueScheduledSources = enqueueScheduledSources,
  now: () => number = Date.now,
): Promise<SourceSchedulerResult> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("Source scheduler deadline exceeded"));
    }, DISPATCH_TIMEOUT_MS);
  });

  const dispatch = async () => {
    const observedAt = new Date(scheduledTime).toISOString();
    const enqueued = await enqueue(observedAt, "cloudflare");
    controller.signal.throwIfAborted();
    const endpoint = new URL(
      "/api/internal/source-jobs/run",
      env.NADHIR_APP_URL,
    );
    const deadline = now() + DISPATCH_BUDGET_MS;
    let dispatched = 0;
    let failed = 0;
    for (let wave = 0; wave < DISPATCH_WAVES; wave += 1) {
      if (controller.signal.aborted || (wave > 0 && now() >= deadline)) break;
      const settled = await Promise.allSettled(
        Array.from({ length: DISPATCH_PARALLEL }, async () => {
          const response = await fetchImpl(endpoint.toString(), {
            method: "POST",
            headers: { authorization: `Bearer ${env.NADHIR_CRON_SECRET}` },
            signal: controller.signal,
          });
          await response.body?.cancel();
          return response.ok;
        }),
      );
      for (const result of settled)
        if (result.status === "fulfilled" && result.value) dispatched += 1;
        else failed += 1;
    }
    if (dispatched === 0) throw new Error("All source job dispatches failed");
    return { enqueued, dispatched, failed };
  };

  try {
    return await Promise.race([dispatch(), expired]);
  } finally {
    clearTimeout(timeout!);
  }
}
