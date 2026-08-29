import { createClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service role key is required: seeding writes reference data that RLS blocks for anon.",
  );
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Northern Algeria, same coverage as the geo seed.
const BBOX = "32.0,-2.5,37.5,9.0";
const OVERPASS = "https://overpass-api.de/api/interpreter";

const QUERY = `
[out:json][timeout:180];
(
  nwr["leisure"="stadium"](${BBOX});
  nwr["leisure"="pitch"](${BBOX});
  nwr["leisure"="recreation_ground"](${BBOX});
  nwr["amenity"="parking"]["parking"="surface"](${BBOX});
  nwr["place"="square"](${BBOX});
  nwr["natural"="beach"](${BBOX});
);
out tags center;
`;

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function areaType(tags: Record<string, string>): string | null {
  if (tags["leisure"] === "stadium") return "stadium";
  if (tags["leisure"] === "pitch" || tags["leisure"] === "recreation_ground")
    return "pitch";
  if (tags["amenity"] === "parking") return "parking";
  if (tags["place"] === "square") return "square";
  if (tags["natural"] === "beach") return "beach";
  return null;
}

async function communesById() {
  const rows: { id: string; lat: number; lon: number }[] = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await db
      .from("admin_units")
      .select("id, lat, lon")
      .eq("level", "commune")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as typeof rows));
    if ((data ?? []).length < 1000) return rows;
  }
}

function nearestCommune(
  lat: number,
  lon: number,
  communes: { id: string; lat: number; lon: number }[],
) {
  let best: { id: string; d: number } | null = null;
  for (const c of communes) {
    const d = (c.lat - lat) ** 2 + (c.lon - lon) ** 2;
    if (!best || d < best.d) best = { id: c.id, d };
  }
  // ~0.3° ≈ 30 km: farther than that the attribution is noise, keep it null.
  return best && best.d < 0.09 ? best.id : null;
}

const res = await fetch(OVERPASS, {
  method: "POST",
  body: `data=${encodeURIComponent(QUERY)}`,
  headers: { "content-type": "application/x-www-form-urlencoded" },
});
if (!res.ok) {
  console.error(`Overpass returned ${res.status}`);
  process.exit(1);
}
const payload = (await res.json()) as { elements: OverpassElement[] };
const communes = await communesById();

const rows = payload.elements.flatMap((el) => {
  const tags = el.tags ?? {};
  const type = areaType(tags);
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const name = tags["name:fr"] ?? tags["name"] ?? tags["name:ar"];
  if (!type || lat === undefined || lon === undefined || !name) return [];
  return [
    {
      osm_id: el.id,
      name,
      name_ar: tags["name:ar"] ?? null,
      area_type: type,
      lat,
      lon,
      commune_id: nearestCommune(lat, lon, communes),
      source: "osm",
    },
  ];
});

console.log(`Overpass gave ${payload.elements.length} elements, ${rows.length} usable`);

for (let i = 0; i < rows.length; i += 500) {
  const { error } = await db
    .from("open_areas")
    .upsert(rows.slice(i, i + 500), { onConflict: "osm_id" });
  if (error) throw new Error(`open_areas upsert failed: ${error.message}`);
}

console.log(`Seeded ${rows.length} open areas`);
