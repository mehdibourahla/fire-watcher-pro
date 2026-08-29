import { describe, expect, it } from "vitest";

import { enqueueSos, loadSosQueue, markSosSent } from "@/lib/sos-queue";

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
}

describe("sos queue", () => {
  it("round-trips an entry", () => {
    const storage = memoryStorage();
    const entry = enqueueSos(storage, { lat: 36.5, lon: 4.0, note: null });
    const queue = loadSosQueue(storage);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.id).toBe(entry.id);
    expect(queue[0]!.lat).toBe(36.5);
    expect(queue[0]!.sent).toBe(false);
    expect(new Date(queue[0]!.created_at).getTime()).not.toBeNaN();
  });

  it("marks an entry sent without dropping others", () => {
    const storage = memoryStorage();
    const a = enqueueSos(storage, { lat: null, lon: null, note: "a" });
    const b = enqueueSos(storage, { lat: null, lon: null, note: "b" });
    markSosSent(storage, a.id);
    const queue = loadSosQueue(storage);
    expect(queue.find((e) => e.id === a.id)?.sent).toBe(true);
    expect(queue.find((e) => e.id === b.id)?.sent).toBe(false);
  });

  it("treats corrupt storage as an empty queue", () => {
    const storage = memoryStorage({ "nadhir.sos.queue": "{not json" });
    expect(loadSosQueue(storage)).toEqual([]);
    expect(() => enqueueSos(storage, { lat: 1, lon: 2, note: null })).not.toThrow();
    expect(loadSosQueue(storage)).toHaveLength(1);
  });
});
