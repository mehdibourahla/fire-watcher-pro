import { supabase } from "@/integrations/supabase/client";

export async function signOutAccount(): Promise<"global" | "local"> {
  // a shared phone must stop receiving this account's alerts before the session goes
  const { leaveUserPush } = await import("@/lib/push");
  await leaveUserPush();
  const { error } = await supabase.auth.signOut();
  if (!error) return "global";
  // Supabase clears the local session even when remote revocation fails.
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (!sessionError && !data.session) return "local";
  throw error;
}
