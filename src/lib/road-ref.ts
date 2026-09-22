// OSM, and so the basemap, numbers the East-West motorway A2 and the North-South A1
const NAMED_MOTORWAYS: [RegExp, string][] = [
  [/autoroute\s+est[\s-]+ouest/i, "A2"],
  [/autoroute\s+nord[\s-]+sud/i, "A1"],
];

export function parseRoadRef(text: string): string | null {
  const national =
    text.match(/\bRN\s?0*(\d{1,3}[A-Z]?)\b/) ??
    text.match(/\broute\s+nationale\s+(?:n(?:°|o\.?|uméro)\s*)?0*(\d{1,3})\b/i);
  if (national) return `RN ${national[1]}`;
  const motorway = text.match(/\bautoroute\s+A\s?(\d)\b/i);
  if (motorway) return `A${motorway[1]}`;
  const named = NAMED_MOTORWAYS.flatMap(([pattern, ref]) => {
    const index = text.search(pattern);
    return index < 0 ? [] : [{ index, ref }];
  }).sort((a, b) => a.index - b.index);
  return named[0]?.ref ?? null;
}

export function parseDestination(text: string): string | null {
  const match = text.match(
    /(?:en direction (?:de la |du |des |de l'|de l’|d'|d’|de )|\bvers )([^,.;()]+)/,
  );
  const place = match?.[1]?.trim();
  if (!place || !/^\p{Lu}/u.test(place)) return null;
  return place;
}
