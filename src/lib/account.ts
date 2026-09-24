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
  notify_weather: boolean;
  notify_official: boolean;
  notify_road: boolean;
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

export const MAX_ZONES = 10;

export const ZONE_HAZARDS = [
  { key: "notify_fires", label: "account.notifyFires" },
  { key: "notify_risk", label: "account.notifyRisk" },
  { key: "notify_weather", label: "account.notifyWeather" },
  { key: "notify_official", label: "account.notifyOfficial" },
  { key: "notify_road", label: "account.notifyRoad" },
] as const;

export type ZoneHazardKey = (typeof ZONE_HAZARDS)[number]["key"];

// the zone form prefilled this point until 2026-09-24; zones still on it were never placed
export const isDefaultPoint = (zone: Pick<Zone, "lat" | "lon">) =>
  zone.lat === 36.7 && zone.lon === 4.05;

export type ZoneInput = Pick<
  Zone,
  | "name"
  | "lat"
  | "lon"
  | "radius_km"
  | "commune_id"
  | "min_danger_level"
  | ZoneHazardKey
>;

export async function saveZone(input: ZoneInput, id?: string) {
  if (id) {
    const { error } = await supabase.from("zones").update(input).eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("no session");
  const { error } = await supabase
    .from("zones")
    .insert({ ...input, user_id: auth.user.id });
  if (error) throw new Error(error.message);
}

export async function setZoneActive(id: string, active: boolean) {
  const { error } = await supabase
    .from("zones")
    .update({ active })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteZone(id: string) {
  const { error } = await supabase.from("zones").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

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
    return (data ?? null) as unknown as Profile | null;
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
