import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllPages } from "@/lib/paginate";

/* ONM (Office National de la Météorologie) vigilance feed: CAP 1.2 warnings per
 * wilaya, CC BY 4.0, registered WMO alerting authority (OID 2.49.0.1.12.0).
 * Nadhir RELAYS these verbatim with source and timestamps — it never composes or
 * edits an authority's warning (CONTEXT.md, Instruction). The Atom feed carries
 * the CAP summary inline, so one fetch covers all wilayas. */
const FEED_URL = "https://ametvigilance.meteo.dz/rss/rss_meteo_dz.xml";

export type OnmEntry = {
  cap_id: string;
  title: string;
  event: string;
  severity: string;
  urgency: string;
  certainty: string;
  onset: string | null;
  expires: string | null;
  sent: string;
  area_desc: string;
  cap_url: string | null;
};

const tag = (entry: string, name: string): string | null => {
  const m = entry.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1]!.trim() : null;
};

export function parseOnmFeed(xml: string): OnmEntry[] {
  if (!xml.includes("urn:oasis:names:tc:emergency:cap:1.2")) return [];
  const out: OnmEntry[] = [];
  for (const entry of xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
    const cap_id = tag(entry, "id");
    const title = tag(entry, "title");
    const sent = tag(entry, "cap:sent");
    const area = tag(entry, "cap:areaDesc");
    if (!cap_id || !title || !sent || !area) continue;
    out.push({
      cap_id,
      title,
      // "Rain Moderate warning for the wilaya: X" — the first word is the event
      event: title.split(" ")[0] ?? "Unknown",
      severity: tag(entry, "cap:severity") ?? "Unknown",
      urgency: tag(entry, "cap:urgency") ?? "Unknown",
      certainty: tag(entry, "cap:certainty") ?? "Unknown",
      onset: tag(entry, "cap:onset"),
      expires: tag(entry, "cap:expires"),
      sent,
      area_desc: area,
      cap_url: entry.match(/href="([^"]*\/CAPs\/[^"]+\.xml)"/)?.[1] ?? null,
    });
  }
  return out;
}

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

export function matchWilaya<T extends { name_fr: string }>(
  areaDesc: string,
  wilayas: T[],
): T | null {
  const target = normalizeName(areaDesc);
  return wilayas.find((w) => normalizeName(w.name_fr) === target) ?? null;
}

export type OnmRun = {
  fetched: number;
  stored: number;
  unmatched: number;
  error?: string;
};

export async function ingestOnm(): Promise<OnmRun> {
  let xml: string;
  try {
    const res = await fetch(FEED_URL, {
      headers: { accept: "application/atom+xml" },
    });
    if (!res.ok)
      return {
        fetched: 0,
        stored: 0,
        unmatched: 0,
        error: `ONM feed ${res.status}`,
      };
    xml = await res.text();
  } catch (error) {
    return {
      fetched: 0,
      stored: 0,
      unmatched: 0,
      error: error instanceof Error ? error.message : "ONM fetch failed",
    };
  }

  const entries = parseOnmFeed(xml);
  if (!entries.length)
    return {
      fetched: 0,
      stored: 0,
      unmatched: 0,
      error: "ONM feed returned no CAP entries",
    };

  const wilayas = await fetchAllPages<{ id: string; name_fr: string }>(
    (from, to) =>
      supabaseAdmin
        .from("admin_units")
        .select("id, name_fr")
        .eq("level", "wilaya")
        .range(from, to),
  );

  let unmatched = 0;
  const rows = entries.map((e) => {
    const wilaya = matchWilaya(e.area_desc, wilayas);
    if (!wilaya) unmatched += 1;
    return { ...e, wilaya_id: wilaya?.id ?? null };
  });

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin
      .from("onm_vigilance")
      .upsert(rows.slice(i, i + 500), { onConflict: "cap_id" });
    if (error)
      return {
        fetched: entries.length,
        stored: 0,
        unmatched,
        error: `onm_vigilance upsert failed: ${error.message}`,
      };
  }

  return { fetched: entries.length, stored: rows.length, unmatched };
}
