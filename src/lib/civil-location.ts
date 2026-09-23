import type { CivilArea } from "./civil-agent";
import { normalizeArabic } from "./text-sources/normalize";

export type PlaceUnit = {
  id: string;
  name_fr: string;
  name_ar: string;
  name_en: string | null;
  level: string;
  parent_id: string | null;
};
export type PlaceAlias = { admin_unit_id: string; alias_ar: string };
export type PlaceSettlement = {
  name: string;
  name_ar: string | null;
  place_type: string;
  commune_id: string | null;
};
type Entry = { area: CivilArea; names: string[]; locality: boolean };
export type PlaceIndex = Entry[];

const LIMIT = 30;

const fold = (text: string) =>
  normalizeArabic(text)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

// OSM names mix scripts ("Birtouta ⴱⴻⵔⵜⵓⵜⴰ بئر توتة"); each script is its own name
const foldNames = (text: string) =>
  [
    text,
    ...(text.match(/\p{Script=Latin}[\p{Script=Latin}\s'’-]*/gu) ?? []),
    ...(text.match(/\p{Script=Arabic}[\p{Script=Arabic}\s]*/gu) ?? []),
  ]
    .map(fold)
    .filter(Boolean);

function editSimilarity(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = current;
  }
  return 1 - previous[b.length]! / Math.max(a.length, b.length);
}

function score(query: string, name: string) {
  if (query === name) return 1;
  const [short, long] =
    query.length <= name.length ? [query, name] : [name, query];
  if (short.length >= 5 && long.includes(short))
    return 0.8 + (0.1 * short.length) / long.length;
  const similarity = editSimilarity(query, name);
  return similarity >= 0.75 ? similarity * 0.8 : 0;
}

export function buildPlaceIndex(data: {
  units: PlaceUnit[];
  aliases: PlaceAlias[];
  settlements: PlaceSettlement[];
}): PlaceIndex {
  const byId = new Map(data.units.map((unit) => [unit.id, unit]));
  const area = (unit: PlaceUnit, matched?: string): CivilArea => ({
    id: unit.id,
    name_fr: unit.name_fr,
    name_ar: unit.name_ar,
    level: unit.level,
    parent_id: unit.parent_id,
    wilaya: unit.parent_id ? (byId.get(unit.parent_id)?.name_fr ?? null) : null,
    ...(matched ? { matched } : {}),
  });
  const aliases = new Map<string, string[]>();
  for (const alias of data.aliases)
    aliases.set(alias.admin_unit_id, [
      ...(aliases.get(alias.admin_unit_id) ?? []),
      alias.alias_ar,
    ]);
  const entries: Entry[] = data.units.map((unit) => ({
    area: area(unit),
    names: [
      unit.name_fr,
      unit.name_ar,
      unit.name_en ?? "",
      ...(aliases.get(unit.id) ?? []),
    ]
      .map(fold)
      .filter(Boolean),
    locality: false,
  }));
  for (const place of data.settlements) {
    const commune = place.commune_id ? byId.get(place.commune_id) : undefined;
    if (!commune) continue;
    const label = place.name_ar ?? place.name;
    entries.push({
      area: area(commune, `${label} (${place.place_type})`),
      names: [place.name, place.name_ar ?? ""].flatMap(foldNames),
      locality: true,
    });
  }
  return entries;
}

export function searchPlaces(
  index: PlaceIndex,
  query: string,
  parentId: string | null,
): CivilArea[] {
  const term = fold(query);
  if (!term) return [];
  const best = new Map<string, { area: CivilArea; score: number }>();
  for (const entry of index) {
    if (parentId && entry.area.parent_id !== parentId) continue;
    const top =
      Math.max(0, ...entry.names.map((name) => score(term, name))) -
      (entry.locality ? 0.05 : 0);
    if (top <= 0) continue;
    const seen = best.get(entry.area.id);
    if (!seen || top > seen.score)
      best.set(entry.area.id, { area: entry.area, score: top });
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMIT)
    .map(({ area }) => area);
}
