import { definePlugin } from "nitro";

import {
  dispatchScheduledSources,
  sourceSchedulerConfig,
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
  });
});
