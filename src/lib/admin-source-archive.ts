import { infiniteQueryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { archivePayloadName } from "./source-archive-export";
import { firstPage, nextOffset, pageRange, pageRows } from "@/lib/paging";

export const sourceArchiveQuery = (source: string, errorsOnly = false) =>
  infiniteQueryOptions({
    queryKey: ["admin", "source-archive", source, errorsOnly],
    initialPageParam: firstPage,
    getNextPageParam: nextOffset,
    select: pageRows,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("source_captures")
        .select("*")
        .order("requested_at", { ascending: false })
        .order("id")
        .range(...pageRange(pageParam));
      if (source) query = query.eq("source_key", source);
      if (errorsOnly) query = query.gte("http_status", 400);
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
