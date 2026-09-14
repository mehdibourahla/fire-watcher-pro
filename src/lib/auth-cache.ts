import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function watchAuthCache(queryClient: QueryClient) {
  let previousUser: string | null | undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const nextUser = session?.user.id ?? null;
    if (previousUser !== undefined && previousUser !== nextUser) {
      void queryClient.cancelQueries();
      queryClient.clear();
    }
    previousUser = nextUser;
  });
  return () => data.subscription.unsubscribe();
}
