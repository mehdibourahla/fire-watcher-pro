import { queryOptions } from "@tanstack/react-query";

import { stripImageMetadata } from "@/lib/image-metadata";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "./roles";

export type ReportStatus = "pending" | "approved" | "rejected";
export type Sighting = "smoke" | "flames" | "smell" | "other";
export type SizeHint = "small" | "medium" | "large";
export type ReportKind =
  | "sighting"
  | "flooding"
  | "storm_damage"
  | "road_blocked"
  | "earthquake"
  | "person_trapped"
  | "other";
export type PublishState = "classifying" | "published" | "held" | "private";

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
  hazard: string | null;
  summary: string | null;
  publish_state: PublishState;
  classifier: string | null;
  classified_at: string | null;
  expires_at: string | null;
  flagged_at: string | null;
  witnesses?: number;
};

export type NewReport = {
  kind: ReportKind;
  lat: number;
  lon: number;
  note: string | null;
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
    const reports = (data ?? []) as unknown as CitizenReport[];
    const live = reports.filter((r) => r.publish_state === "published");
    if (!live.length) return reports;
    // reporters cannot read other people's votes, only the public count
    const counts = await supabase
      .from("hazard_reports")
      .select("id, witnesses")
      .in(
        "id",
        live.map((r) => r.id),
      );
    if (counts.error) throw new Error(counts.error.message);
    const byId = new Map(
      (counts.data ?? []).map((c) => [c.id, c.witnesses ?? 0]),
    );
    return reports.map((r) => ({ ...r, witnesses: byId.get(r.id) ?? 0 }));
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
    if (!auth.user) return [] as AppRole[];
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.user.id);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.role as AppRole);
  },
});

export async function createReport(
  input: NewReport,
  photo?: ReportPhotoUpload | null,
): Promise<string> {
  const user = await authenticatedUser("reports.submitFailed");
  const reportId = crypto.randomUUID();
  let photoPath: string | null = null;
  if (photo)
    photoPath = await uploadReportPhotoForUser(
      photo.file,
      user.id,
      photo.objectId,
    );
  let creationFailed: boolean;
  let limitReached = false;
  try {
    const { error } = await supabase.from("citizen_reports").insert({
      ...input,
      id: reportId,
      user_id: user.id,
      status: "pending",
      photo_url: photoPath,
    });
    creationFailed = !!error;
    limitReached = !!error?.message.startsWith("Daily report limit");
  } catch {
    try {
      const { data: committed } = await supabase
        .from("citizen_reports")
        .select("id")
        .eq("id", reportId)
        .maybeSingle();
      if (committed) return reportId;
    } catch {
      throw new ReportMutationError("reports.submitUnknown");
    }
    creationFailed = true;
  }
  if (!creationFailed) return reportId;
  if (photoPath) {
    if (!(await removeReportPhoto(photoPath)))
      throw new ReportMutationError("reports.submitCleanupFailed");
  }
  throw new ReportMutationError(
    limitReached ? "reports.dailyLimit" : "reports.submitFailed",
  );
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
  cluster_id: string | null;
}) {
  const { error } = await supabase.rpc("moderate_citizen_report", {
    _id: input.id,
    _status: input.status,
    _note: input.moderation_note ?? null,
    _cluster: input.cluster_id,
  });
  if (error) throw new Error(error.message);
}

const REPORT_PHOTO_BUCKET = "report-photos";

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

export type PublishResult = {
  publish_state: PublishState;
  hazard: string | null;
  summary: string | null;
};

export async function publishReport(id: string): Promise<PublishResult> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session)
    throw new ReportMutationError("reports.submitFailed");
  const res = await fetch("/api/private/report-publish", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(`report publish failed (${res.status})`);
  return (await res.json()) as PublishResult;
}

const WITNESS_ERRORS: Record<string, string> = {
  too_far: "reports.witnessTooFar",
  own_report: "reports.witnessOwn",
  report_not_open: "reports.witnessClosed",
  witness_rate_limited: "reports.witnessRateLimited",
};

export async function witnessReport(
  id: string,
  vote: "seen" | "gone",
  position: { lat: number; lon: number },
): Promise<number> {
  const { data, error } = await supabase.rpc("witness_report", {
    _report: id,
    _vote: vote,
    _lat: position.lat,
    _lon: position.lon,
  });
  if (error)
    throw new ReportMutationError(
      WITNESS_ERRORS[error.message] ?? "reports.witnessFailed",
    );
  return data;
}

export type Contribution = {
  published: number;
  corroborated: number;
  confirmations: number;
  hazards: number;
  alerted: number;
  witnesses: number;
  points: number;
};

export const contributionQuery = queryOptions({
  queryKey: ["reports", "contribution"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("my_contribution");
    if (error) throw new Error(error.message);
    return data as unknown as Contribution;
  },
});
