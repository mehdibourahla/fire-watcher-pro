import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type ReportStatus = "pending" | "approved" | "rejected";
export type Sighting = "smoke" | "flames" | "smell" | "other";
export type SizeHint = "small" | "medium" | "large";

export type CitizenReport = {
  id: string;
  user_id: string;
  lat: number;
  lon: number;
  observed_at: string;
  sighting: Sighting;
  size_hint: SizeHint;
  note: string | null;
  photo_url: string | null;
  commune_id: string | null;
  cluster_id: string | null;
  status: ReportStatus;
  moderation_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type NewReport = {
  lat: number;
  lon: number;
  sighting: Sighting;
  size_hint: SizeHint;
  note: string | null;
  photo_url: string | null;
  commune_id: string | null;
  observed_at: string;
};

const SELECT = "*";

export const myReportsQuery = queryOptions({
  queryKey: ["reports", "mine"],
  queryFn: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return [] as CitizenReport[];
    const { data, error } = await supabase
      .from("citizen_reports")
      .select(SELECT)
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as CitizenReport[];
  },
});

export const approvedReportsQuery = queryOptions({
  queryKey: ["reports", "approved"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("citizen_reports")
      .select(SELECT)
      .eq("status", "approved")
      .order("observed_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as CitizenReport[];
  },
});

export const moderationQueueQuery = queryOptions({
  queryKey: ["reports", "queue"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("citizen_reports")
      .select(SELECT)
      .order("status")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as CitizenReport[];
  },
});

export const myRolesQuery = queryOptions({
  queryKey: ["roles", "mine"],
  queryFn: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return [] as string[];
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.user.id);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.role as string);
  },
});

export async function createReport(input: NewReport) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const { error } = await supabase
    .from("citizen_reports")
    .insert({ ...input, user_id: auth.user.id, status: "pending" });
  if (error) throw new Error(error.message);
}

export async function deleteReport(id: string) {
  const { error } = await supabase
    .from("citizen_reports")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function moderateReport(input: {
  id: string;
  status: ReportStatus;
  moderation_note?: string | null;
  cluster_id?: string | null;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("citizen_reports")
    .update({
      status: input.status,
      moderation_note: input.moderation_note ?? null,
      ...(input.cluster_id !== undefined
        ? { cluster_id: input.cluster_id }
        : {}),
      reviewed_by: auth.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

export const REPORT_PHOTO_BUCKET = "report-photos";

/** Uploads a report photo into the reporter's own folder and returns its storage path. */
export async function uploadReportPhoto(file: File): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  if (!file.type.startsWith("image/")) throw new Error("unsupported_type");
  if (file.size > 8 * 1024 * 1024) throw new Error("too_large");
  const ext =
    (file.name.split(".").pop() ?? "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(REPORT_PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** Photos live in a private bucket: owners and moderators read them through a signed URL. */
export async function signedPhotoUrl(
  photo: string | null,
): Promise<string | null> {
  if (!photo) return null;
  if (/^https?:\/\//.test(photo)) return photo;
  const { data, error } = await supabase.storage
    .from(REPORT_PHOTO_BUCKET)
    .createSignedUrl(photo, 60 * 30);
  if (error) return null;
  return data?.signedUrl ?? null;
}
