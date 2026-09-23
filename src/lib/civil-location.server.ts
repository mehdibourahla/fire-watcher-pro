import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CivilArea } from "./civil-agent";
import {
  buildPlaceIndex,
  searchPlaces,
  type PlaceAlias,
  type PlaceIndex,
  type PlaceSettlement,
  type PlaceUnit,
} from "./civil-location";
import { fetchAllPages } from "./paginate";

const INDEX_TTL_MS = 3_600_000;
// the built index, never a pending promise: Workers reject I/O awaited across requests
let cached: { at: number; index: PlaceIndex } | null = null;

async function loadIndex(signal: AbortSignal): Promise<PlaceIndex> {
  const [units, aliases, settlements] = await Promise.all([
    fetchAllPages<PlaceUnit>((from, to) =>
      supabaseAdmin
        .from("admin_units")
        .select("id,name_fr,name_ar,name_en,level,parent_id")
        .order("code")
        .range(from, to)
        .abortSignal(signal),
    ),
    fetchAllPages<PlaceAlias>((from, to) =>
      supabaseAdmin
        .from("admin_unit_aliases")
        .select("admin_unit_id,alias_ar")
        .order("admin_unit_id")
        .range(from, to)
        .abortSignal(signal),
    ),
    fetchAllPages<PlaceSettlement>((from, to) =>
      supabaseAdmin
        .from("settlements")
        .select("name,name_ar,place_type,commune_id")
        .not("commune_id", "is", null)
        .order("osm_id")
        .range(from, to)
        .abortSignal(signal),
    ),
  ]).catch((error: unknown) => {
    throw new Error(
      `Administrative search: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  return buildPlaceIndex({ units, aliases, settlements });
}

export async function searchAdministrativeAreas(
  query: string,
  parentId: string | null,
  signal: AbortSignal,
): Promise<CivilArea[]> {
  if (!cached || Date.now() - cached.at > INDEX_TTL_MS)
    cached = { at: Date.now(), index: await loadIndex(signal) };
  return searchPlaces(cached.index, query, parentId);
}
