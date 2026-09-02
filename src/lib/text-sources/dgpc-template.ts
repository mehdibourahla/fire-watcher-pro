export type DgpcKind =
  "bulletin" | "incident" | "urban" | "weather_relay" | "other";

export type DgpcStatus =
  "ongoing" | "contained" | "extinguished" | "monitoring" | "unknown";

export type DgpcLine = {
  wilaya: string | null;
  raw: string;
  communes: string[];
  place: string | null;
  status: DgpcStatus;
  count: number;
};

export type DgpcBulletin = {
  kind: DgpcKind;
  asOf: string | null;
  totals: { total: number; extinguished: number; ongoing: number } | null;
  wilayaCounts: { wilaya: string; count: number }[];
  lines: DgpcLine[];
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

export function classifyDgpcPost(text: string): DgpcKind {
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

export function dgpcAsOf(text: string, postedAt: string): string | null {
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

function statusOf(line: string): DgpcStatus {
  if (/تم إخماد|إخماده|إخمادها|لم يعد يشكل/.test(line)) return "extinguished";
  if (/متواصلة|متواصل|جارية|يتواصل|تتواصل/.test(line)) return "ongoing";
  if (/تحت الحراسة|تحت المراقبة|معالجة بؤر|بقايا الجمر/.test(line))
    return "monitoring";
  if (/تحت السيطرة|مسيطر عليه|تراجع/.test(line)) return "contained";
  return "unknown";
}

const STOP =
  /(?:[،,]\s*(?:مع|تم|العملية|عملية|عمليات|حيث|الحريق|بالمكان|و?تدعيم|لا يشكل|بعد|في)\b|\s+(?:بالمكان|بالقرب|بمنطقة|منطقة|دائرة|دون|في|مع|عمليات?|العملية|الحريق|تم)\s|\.\.\.|$)/;

function splitCommunes(segment: string): string[] {
  const cleaned = segment
    .replace(/\(\s*\d+\s*\)/g, "،")
    .replace(/\([^)]*\)?/g, "")
    .replace(/\s+و(?=\S)/g, "،")
    .replace(/^\s*و(?=\S)/, "");
  return cleaned
    .split(/[،,]/)
    .map((p) =>
      p
        .replace(/^\s*و(?=\S)/, "")
        .trim()
        .replace(/[.،:]+$/, ""),
    )
    .filter((p) => p.length >= 3);
}

function countOf(line: string, communes: number): number {
  const digits = latinDigits(line);
  const n = /(?:اندلاع|تسجيل)\s*(\d+)/.exec(digits);
  if (n) return Number(n[1]);
  if (/حريقين/.test(line)) return 2;
  if (/عدة حرائق/.test(line)) return Math.max(communes, 2);
  return Math.max(communes, 1);
}

function placeOf(line: string): string | null {
  const m =
    /بالمكان المسمى\s+(.+?)(?:[،,]|\s+(?:تم|مع|العملية|عملية|الحريق|في)\s|\.\.\.|$)/.exec(
      line,
    );
  return m ? m[1]!.trim() : null;
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
    lines: [],
  };
  if (kind !== "bulletin" && kind !== "incident") return empty;

  const digits = latinDigits(text);
  const total = /العدد الإجمالي للحرائق[^\d]*(\d+)/.exec(digits);
  const extinguished = /تم إخمادها[^\d]*(\d+)/.exec(digits);
  const ongoing = /الحرائق المتواصلة[^\d]*(\d+)/.exec(digits);
  const totals =
    total && extinguished && ongoing
      ? {
          total: Number(total[1]),
          extinguished: Number(extinguished[1]),
          ongoing: Number(ongoing[1]),
        }
      : null;

  const wilayaCounts: { wilaya: string; count: number }[] = [];
  const lines: DgpcLine[] = [];
  let header: string | null = null;

  for (const rawLine of digits.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const count = /^⏮️⏮️\s*ولاية\s*#?(.+?)\s+(\d+)\s*$/.exec(line);
    if (count) {
      wilayaCounts.push({
        wilaya: cleanWilaya(count[1]!),
        count: Number(count[2]),
      });
      continue;
    }
    const head = /^(?:✅⏮️\s*)?ولاية\s*#?([^\d]+?)\s*:?\s*$/.exec(line);
    if (head) {
      header = cleanWilaya(head[1]!);
      continue;
    }

    let wilaya: string | null = null;
    let communes: string[] = [];
    const inline = /حرائق?\s+ولاية\s*#?(.+?)\s+(?:اندلاع|تسجيل|ببلدي)/.exec(
      line,
    );
    if (inline) wilaya = cleanWilaya(inline[1]!);
    const communeFirst =
      /حريق\s+(?:هام\s+)?(?:غابة\s+|أحراش\s+)?ب?بلدية\s+(.+?)\s+ولاية\s*#?(\S+(?:\s+(?!منطقة|عملية|عمليات|الحريق|بالمكان)\S+)?)/.exec(
        line,
      );
    if (communeFirst) {
      wilaya = cleanWilaya(communeFirst[2]!);
      communes = [communeFirst[1]!.trim()];
    } else {
      const list = /ببلدي(?:ة|تي|ات)\s+(.+)$/.exec(line);
      if (list) {
        const stop = STOP.exec(list[1]!);
        const segment = stop ? list[1]!.slice(0, stop.index) : list[1]!;
        communes = splitCommunes(segment);
      }
    }
    if (!communes.length) continue;
    const status = statusOf(line);
    lines.push({
      wilaya: wilaya ?? header,
      raw: line,
      communes,
      place: placeOf(line),
      // the important-fires section of a bulletin lists fires still burning at its as-of time
      status: status === "unknown" && kind === "bulletin" ? "ongoing" : status,
      count: countOf(line, communes.length),
    });
  }

  return { kind, asOf: dgpcAsOf(text, postedAt), totals, wilayaCounts, lines };
}
