import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  display_name: string | null;
  locale: string;
  phone: string | null;
  alert_email: boolean;
  alert_push: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  min_danger_level: number;
};

export type ProfileSettingsInput = Pick<
  Profile,
  | "display_name"
  | "phone"
  | "locale"
  | "alert_email"
  | "alert_push"
  | "quiet_hours_start"
  | "quiet_hours_end"
  | "min_danger_level"
>;

export class ProfileSettingsError extends Error {
  override cause?: unknown;

  constructor(cause?: unknown) {
    super("account.saveFailed");
    this.name = "ProfileSettingsError";
    this.cause = cause;
  }
}

export type Zone = {
  id: string;
  user_id: string;
  name: string;
  lat: number;
  lon: number;
  radius_km: number;
  commune_id: string | null;
  min_danger_level: number;
  notify_fires: boolean;
  notify_risk: boolean;
  active: boolean;
  created_at: string;
};

export const zonesQuery = queryOptions({
  queryKey: ["zones"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("zones")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Zone[];
  },
});

export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as unknown as Profile;
    const inserted = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        display_name: (user.user_metadata?.["full_name"] as string) ?? null,
      })
      .select("*")
      .maybeSingle();
    if (inserted.error) throw new Error(inserted.error.message);
    return (inserted.data ?? null) as unknown as Profile | null;
  },
});

export async function saveProfileSettings(input: ProfileSettingsInput) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new ProfileSettingsError(authError);

  const { error } = await supabase
    .from("profiles")
    .update(input)
    .eq("id", auth.user.id);
  if (error) throw new ProfileSettingsError(error);
}
