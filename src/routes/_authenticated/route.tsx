import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { hasSessionCookie } from "@/integrations/supabase/session-cookie";

export const Route = createFileRoute("/_authenticated")({
  // data-only runs beforeLoad on the server, so a signed-out visitor is redirected
  // before any markup is committed; the component still renders client-side only.
  ssr: "data-only",
  beforeLoad: () => {
    if (!hasSessionCookie()) throw redirect({ to: "/auth" });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [valid, setValid] = useState<boolean | null>(null);

  // A dehydrated data-only match does not re-run beforeLoad on the client, and the
  // cookie check cannot see a revoked or expired session — so validate here, and
  // hold the subtree back until it resolves rather than rendering doomed queries.
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return;
      const ok = !error && !!data.user;
      setValid(ok);
      if (!ok) void navigate({ to: "/auth", replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!valid) return null;
  return <Outlet />;
}
