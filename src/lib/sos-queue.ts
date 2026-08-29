export type SosEntry = {
  id: string;
  created_at: string;
  lat: number | null;
  lon: number | null;
  note: string | null;
  sent: boolean;
};

type QueueStorage = Pick<Storage, "getItem" | "setItem">;

const KEY = "nadhir.sos.queue";

export function loadSosQueue(storage: QueueStorage): SosEntry[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SosEntry[]) : [];
  } catch {
    return [];
  }
}

export function enqueueSos(
  storage: QueueStorage,
  input: { lat: number | null; lon: number | null; note: string | null },
): SosEntry {
  const entry: SosEntry = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    lat: input.lat,
    lon: input.lon,
    note: input.note,
    sent: false,
  };
  const queue = loadSosQueue(storage);
  queue.push(entry);
  storage.setItem(KEY, JSON.stringify(queue));
  return entry;
}
