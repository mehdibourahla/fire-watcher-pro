import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { archivePayloadName } from "./source-archive-export";

export const sourceArchiveQuery = (source: string) =>
  queryOptions({
    queryKey: ["admin", "source-archive", source],
    queryFn: async () => {
      let query = supabase
        .from("source_captures")
        .select("*")
        .order("requested_at", { ascending: false })
        .order("id")
        .limit(50);
      if (source) query = query.eq("source_key", source);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

export async function downloadSourcePayload(capture: {
  sha256: string | null;
  storage_path: string | null;
  byte_length: number | null;
}) {
  if (!capture.sha256 || !capture.storage_path)
    throw new Error("Archive payload unavailable");
  const name = archivePayloadName(capture.sha256);
  const { data, error } = await supabase.storage
    .from("source-archive")
    .download(capture.storage_path);
  if (error || !data) throw new Error("Archive download failed");
  if (data.size > 32 * 1024 * 1024 || data.size !== capture.byte_length)
    throw new Error("Archive size mismatch");
  const bytes = await data.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== capture.sha256) throw new Error("Archive checksum mismatch");
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
