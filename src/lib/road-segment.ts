import { haversineKm } from "./nadhir";

export type LonLat = [number, number];

const JOIN_KM = 0.05;
const km = (a: LonLat, b: LonLat) => haversineKm(a[1], a[0], b[1], b[0]);

function nearestOnLine(line: LonLat[], anchor: LonLat) {
  let best = { km: Infinity, index: 0, t: 0 };
  const scale = Math.cos((anchor[1] * Math.PI) / 180);
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i]!;
    const [bx, by] = line[i + 1]!;
    const dx = (bx - ax) * scale;
    const dy = by - ay;
    const span = dx * dx + dy * dy;
    const t = span
      ? Math.max(
          0,
          Math.min(
            1,
            ((anchor[0] - ax) * scale * dx + (anchor[1] - ay) * dy) / span,
          ),
        )
      : 0;
    const point: LonLat = [ax + (bx - ax) * t, ay + (by - ay) * t];
    const distance = km(point, anchor);
    if (distance < best.km) best = { km: distance, index: i, t };
  }
  return best;
}

function chain(start: LonLat[], others: LonLat[][]) {
  let line = [...start];
  const pool = [...others];
  for (let grown = true; grown;) {
    grown = false;
    for (let i = 0; i < pool.length; i++) {
      const piece = pool[i]!;
      const head = line[0]!;
      const tail = line[line.length - 1]!;
      const first = piece[0]!;
      const last = piece[piece.length - 1]!;
      if (km(tail, first) <= JOIN_KM) line = [...line, ...piece.slice(1)];
      else if (km(tail, last) <= JOIN_KM)
        line = [...line, ...[...piece].reverse().slice(1)];
      else if (km(head, last) <= JOIN_KM)
        line = [...piece.slice(0, -1), ...line];
      else if (km(head, first) <= JOIN_KM)
        line = [...[...piece].reverse().slice(0, -1), ...line];
      else continue;
      pool.splice(i, 1);
      grown = true;
      break;
    }
  }
  return line;
}

function pointAt(line: LonLat[], cumulative: number[], at: number): LonLat {
  const i = Math.max(0, cumulative.findIndex((d, k) => k > 0 && d >= at) - 1);
  const span = cumulative[i + 1]! - cumulative[i]!;
  const t = span ? (at - cumulative[i]!) / span : 0;
  const [ax, ay] = line[i]!;
  const [bx, by] = line[i + 1]!;
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

export function cutSegment(
  lines: LonLat[][],
  anchor: LonLat,
  {
    lengthKm = 4,
    maxOffsetKm = 3,
    toward = null,
  }: { lengthKm?: number; maxOffsetKm?: number; toward?: LonLat | null } = {},
): LonLat[] | null {
  const usable = lines.filter((line) => line.length >= 2);
  if (!usable.length) return null;
  const nearest = usable
    .map((line) => ({ line, hit: nearestOnLine(line, anchor) }))
    .sort((a, b) => a.hit.km - b.hit.km)[0]!;
  if (nearest.hit.km > maxOffsetKm) return null;

  const line = chain(
    nearest.line,
    usable.filter((l) => l !== nearest.line),
  );
  const cumulative = line.reduce<number[]>(
    (acc, p, i) => [...acc, i ? acc[i - 1]! + km(line[i - 1]!, p) : 0],
    [],
  );
  const hit = nearestOnLine(line, anchor);
  const at =
    cumulative[hit.index]! +
    hit.t * (cumulative[hit.index + 1]! - cumulative[hit.index]!);
  const from = Math.max(0, at - lengthKm / 2);
  const to = Math.min(cumulative[cumulative.length - 1]!, at + lengthKm / 2);
  const segment = [
    pointAt(line, cumulative, from),
    ...line.filter((_, i) => cumulative[i]! > from && cumulative[i]! < to),
    pointAt(line, cumulative, to),
  ];
  if (
    toward &&
    km(segment[0]!, toward) < km(segment[segment.length - 1]!, toward)
  )
    segment.reverse();
  return segment;
}
