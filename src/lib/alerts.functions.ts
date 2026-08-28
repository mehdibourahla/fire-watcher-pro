import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Re-evaluate the signed-in user's zones on demand and return how many alerts were created. */
export const runMyAlertCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { evaluateAlerts } = await import("@/lib/alerts-engine.server");
    return evaluateAlerts(context.userId);
  });
