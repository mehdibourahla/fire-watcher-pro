import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { hasSessionCookie } from "@/integrations/supabase/session-cookie";

export const Route = createFileRoute("/_authenticated")({
  // data-only runs beforeLoad on the server, so a signed-out visitor is redirected
  // before any markup is committed; the component still renders client-side only.
  ssr: "data-only",
  beforeLoad: async () => {
    if (!hasSessionCookie()) throw redirect({ to: "/auth" });
    if (typeof document === "undefined") return;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
