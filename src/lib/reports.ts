import { queryOptions } from "@tanstack/react-query";

import { stripImageMetadata } from "@/lib/image-metadata";
import { supabase } from "@/integrations/supabase/client";

export type ReportStatus = "pending" | "approved" | "rejected";
export type Sighting = "smoke" | "flames" | "smell" | "other";
export type SizeHint = "small" | "medium" | "large";
export type ReportKind = "sighting" | "road_blocked" | "person_trapped";

export type CitizenReport = {
  id: string;
  user_id: string;
  kind: ReportKind;
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
  kind: ReportKind;
  lat: number;
  lon: number;
  sighting: Sighting;
  size_hint: SizeHint;
  note: string | null;
  commune_id: string | null;
  observed_at: string;
};

export type ReportPhotoDraft = {
  file: File;
  objectId: string;
  previewUrl: string;
  dispose: () => void;
};

type ReportPhotoUpload = Pick<ReportPhotoDraft, "file" | "objectId">;

export class ReportMutationError extends Error {
  override name = "ReportMutationError";
}

async function authenticatedUser(errorKey: string) {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!data.user || error) throw new Error();
    return data.user;
  } catch {
    throw new ReportMutationError(errorKey);
  }
}

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

export async function createReport(
  input: NewReport,
  photo?: ReportPhotoUpload | null,
) {
  const user = await authenticatedUser("reports.submitFailed");
  const reportId = crypto.randomUUID();
  let photoPath: string | null = null;
  if (photo)
    photoPath = await uploadReportPhotoForUser(
      photo.file,
      user.id,
      photo.objectId,
    );
  let creationFailed = false;
  try {
    const { error } = await supabase.from("citizen_reports").insert({
      ...input,
      id: reportId,
      user_id: user.id,
      status: "pending",
      photo_url: photoPath,
    });
    creationFailed = !!error;
  } catch {
    try {
      const { data: committed } = await supabase
        .from("citizen_reports")
        .select("id")
        .eq("id", reportId)
        .maybeSingle();
      if (committed) return;
    } catch {
      throw new ReportMutationError("reports.submitUnknown");
    }
    creationFailed = true;
  }
  if (!creationFailed) return;
  if (photoPath) {
    if (!(await removeReportPhoto(photoPath)))
      throw new ReportMutationError("reports.submitCleanupFailed");
  }
  throw new ReportMutationError("reports.submitFailed");
}

export async function deleteReport(id: string) {
  const user = await authenticatedUser("reports.deleteFailed");
  const { data: report, error: readError } = await supabase
    .from("citizen_reports")
    .select("id, user_id, photo_url")
    .eq("id", id)
    .maybeSingle();
  if (readError || !report || report.user_id !== user.id)
    throw new ReportMutationError("reports.deleteFailed");

  if (report.photo_url) {
    if (!isCanonicalReportPhotoPath(report.photo_url, user.id))
      throw new ReportMutationError("reports.deletePhotoCleanupFailed");
    if (!(await removeReportPhoto(report.photo_url)))
      throw new ReportMutationError("reports.deletePhotoCleanupFailed");
  }

  let deletion = supabase
    .from("citizen_reports")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  deletion = report.photo_url
    ? deletion.eq("photo_url", report.photo_url)
    : deletion.is("photo_url", null);
  const { data: deleted, error: deleteError } = await deletion
    .select("id")
    .maybeSingle();
  if (deleteError || !deleted)
    throw new ReportMutationError("reports.deleteFailed");
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

const UUID_PART =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const REPORT_PHOTO_PATH = new RegExp(
  `^(${UUID_PART})/(${UUID_PART})\\.(jpg|png)$`,
);

export function isCanonicalReportPhotoPath(
  photo: string,
  ownerId?: string,
): boolean {
  const match = REPORT_PHOTO_PATH.exec(photo);
  return !!match && (!ownerId || match[1] === ownerId);
}

function validateReportPhoto(file: File) {
  if (file.size > 8 * 1024 * 1024) throw new Error("too_large");
  if (file.type !== "image/jpeg" && file.type !== "image/png")
    throw new Error("unsupported_type");
}

export function createReportPhotoDraft(file: File): ReportPhotoDraft {
  validateReportPhoto(file);
  const previewUrl = URL.createObjectURL(file);
  let disposed = false;
  return {
    file,
    objectId: crypto.randomUUID(),
    previewUrl,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      URL.revokeObjectURL(previewUrl);
    },
  };
}

async function removeReportPhoto(path: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from(REPORT_PHOTO_BUCKET)
      .remove([path]);
    return !error;
  } catch {
    return false;
  }
}

async function uploadReportPhotoForUser(
  file: File,
  userId: string,
  objectId: string,
): Promise<string> {
  validateReportPhoto(file);
  const clean = stripImageMetadata(
    new Uint8Array(await file.arrayBuffer()),
    file.type,
  );
  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `${userId}/${objectId}.${ext}`;
  try {
    const { error } = await supabase.storage
      .from(REPORT_PHOTO_BUCKET)
      .upload(path, new Blob([clean], { type: file.type }), {
        contentType: file.type,
        upsert: true,
      });
    if (error) throw new Error();
  } catch {
    throw new ReportMutationError("reports.photoFailed");
  }
  return path;
}

export async function signedPhotoUrl(
  photo: string | null,
): Promise<string | null> {
  if (!photo || !isCanonicalReportPhotoPath(photo)) return null;
  const { data, error } = await supabase.storage
    .from(REPORT_PHOTO_BUCKET)
    .createSignedUrl(photo, 60 * 30);
  if (error || !data?.signedUrl) return null;
  try {
    const url = new URL(data.signedUrl);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    )
      return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
