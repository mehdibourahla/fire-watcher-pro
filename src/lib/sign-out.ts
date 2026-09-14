import { supabase } from "@/integrations/supabase/client";

export async function signOutAccount(): Promise<"global" | "local"> {
  const { error } = await supabase.auth.signOut();
  if (!error) return "global";
  // Supabase clears the local session even when remote revocation fails.
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (!sessionError && !data.session) return "local";
  throw error;
}
