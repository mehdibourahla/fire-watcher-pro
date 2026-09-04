import { definePlugin } from "nitro";

import { notifyOperatorOnWatchdog } from "./ingest/operator-alerts.server";
import {
  dispatchScheduledSources,
  sourceSchedulerConfig,
  watchdogDue,
} from "./source-scheduler.server";

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:scheduled", async ({ controller, env }) => {
    const result = await dispatchScheduledSources(
      controller.scheduledTime,
      sourceSchedulerConfig(env),
    );
    console.log(
      JSON.stringify({
        message: "source scheduler dispatched",
        scheduledAt: new Date(controller.scheduledTime).toISOString(),
        ...result,
      }),
    );
    if (!watchdogDue(controller.scheduledTime)) return;
    try {
      const watchdog = await notifyOperatorOnWatchdog();
      console.log(JSON.stringify({ message: "source watchdog", ...watchdog }));
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "source watchdog failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });
});
