export type DgpcKind =
  "bulletin" | "incident" | "urban" | "weather_relay" | "other";

export type DgpcBulletin = {
  kind: DgpcKind;
  asOf: string | null;
  totals: { total: number; extinguished: number; ongoing: number } | null;
  wilayaCounts: { wilaya: string; count: number; raw: string }[];
  distributed: boolean;
  namedCommunes: number;
};

const ALGIERS_OFFSET_MS = 60 * 60_000;
const ARABIC_DIGITS = /[٠-٩]/g;

function latinDigits(s: string): string {
  return s.replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x660));
}

function cleanWilaya(raw: string): string {
  return raw
    .replace(/[#:،,]/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyDgpcPost(text: string): DgpcKind {
  if (
    /#الحرائق_الحضرية_والصناعية|حريق (?:عدادات|بمستودع|شقة|سكن|سيارة|مصنع|محل)/.test(
      text,
    )
  )
    return "urban";
  if (/نشرية جوية/.test(text)) return "weather_relay";
  if (/الحالة العامة لحرائق|حرائق الغطاء النباتي/.test(text)) return "bulletin";
  if (
    /حريق (?:غاب|أحراش|أدغال|أحزمة|محاصيل|أعشاب|نخيل)|حرائق (?:غاب|أحراش)/.test(
      text,
    )
  )
    return "incident";
  return "other";
}

function dgpcAsOf(text: string, postedAt: string): string | null {
  const m = /الساعة\s*(\d{1,2})\s*سا/.exec(latinDigits(text));
  if (!m) return null;
  const hour = Number(m[1]);
  const postedMs = Date.parse(postedAt);
  if (!Number.isFinite(postedMs) || hour > 23) return null;
  const local = new Date(postedMs + ALGIERS_OFFSET_MS);
  let day = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  // a late-evening bulletin published after midnight belongs to the previous day
  if (hour > local.getUTCHours() + 1) day -= 86_400_000;
  return new Date(day + hour * 3_600_000 - ALGIERS_OFFSET_MS).toISOString();
}

function namedCommunes(text: string): number {
  const section = text.search(/أهم الحرائق/);
  if (section < 0) return 0;
  const names = new Set<string>();
  for (const m of text
    .slice(section)
    .matchAll(/(?<!\p{L})[بل]?بلدي(ة|تي)\s+([^:؛،,.\n]+)/gu)) {
    const phrase = m[2]!.replace(/\s+/g, " ").trim();
    const and = phrase.lastIndexOf(" و");
    const pair = m[1] === "تي" && and > 0;
    for (const name of pair
      ? [phrase.slice(0, and), phrase.slice(and + 2)]
      : [phrase])
      names.add(name.trim());
  }
  return names.size;
}

export function parseDgpcBulletin(
  text: string,
  postedAt: string,
): DgpcBulletin {
  const kind = classifyDgpcPost(text);
  const empty: DgpcBulletin = {
    kind,
    asOf: null,
    totals: null,
    wilayaCounts: [],
    distributed: false,
    namedCommunes: 0,
  };
  if (kind !== "bulletin" && kind !== "incident") return empty;

  const digits = latinDigits(text);
  const total =
    /(?:العدد الإجمالي للحرائق|إجمالي الحرائق المسجلة)[^\d]*(\d+)/.exec(digits);
  const extinguished = /تم إخمادها[^\d]*(\d+)/.exec(digits);
  const ongoing = /الحرائق (?:المتواصلة|الجارية)[^\d]*(\d+)/.exec(digits);
  const totals =
    total && extinguished && ongoing
      ? {
          total: Number(total[1]),
          extinguished: Number(extinguished[1]),
          ongoing: Number(ongoing[1]),
        }
      : null;

  const wilayaCounts: DgpcBulletin["wilayaCounts"] = [];
  for (const rawLine of digits.split("\n")) {
    const line = rawLine.trim();
    const count =
      /^(?:⏮️⏮️\s*)?ولاية\s*#?([^\d:]+?)\s*:?\s*(\d+)\s*(?:\([^)]*\))?\s*[،,.]?\s*$/.exec(
        line,
      );
    if (count) {
      wilayaCounts.push({
        wilaya: cleanWilaya(count[1]!),
        count: Number(count[2]),
        raw: line,
      });
      continue;
    }
    // the 24-hour summary form lists the distribution inline: "ولايتي #سطيف (01) و #سوق_أهراس (01)"
    if (/الحرائق (?:المتواصلة|الجارية)/.test(line))
      for (const m of line.matchAll(/#(\S+?)\s*\((\d+)\)/g))
        wilayaCounts.push({
          wilaya: cleanWilaya(m[1]!),
          count: Number(m[2]),
          raw: line,
        });
  }

  return {
    kind,
    asOf: dgpcAsOf(text, postedAt),
    totals,
    wilayaCounts,
    distributed: /موزعة/.test(text) || wilayaCounts.length > 0,
    namedCommunes: namedCommunes(text),
  };
}
