import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CivilArea } from "./civil-agent";

export async function searchAdministrativeAreas(
  query: string,
  parentId: string | null,
  signal: AbortSignal,
): Promise<CivilArea[]> {
  const term = query.replace(/[%_(),."\\]/g, " ").trim();
  if (!term) return [];
  let request = supabaseAdmin
    .from("admin_units")
    .select("id,name_fr,name_ar,level,parent_id")
    .or(
      `name_fr.ilike.%${term}%,name_ar.ilike.%${term}%,name_en.ilike.%${term}%`,
    )
    .order("code")
    .limit(30);
  if (parentId) request = request.eq("parent_id", parentId);
  const { data, error } = await request.abortSignal(signal);
  if (error) throw new Error(`Administrative search: ${error.message}`);
  return data;
}
