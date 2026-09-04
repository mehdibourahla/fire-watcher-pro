export const LOOK_SLOT_MS = 10 * 60_000;

export type Look = { sensor: string; detected_at: string };

function slot(look: Look): string {
  return `${look.sensor}:${Math.floor(Date.parse(look.detected_at) / LOOK_SLOT_MS)}`;
}

/* Two adjacent pixels of a staring sensor in one slot are one look at one fire,
 * not two independent observations of it. */
export function distinctLooks(looks: readonly Look[]): number {
  return new Set(looks.map(slot)).size;
}

export type SensorEvidence = {
  sensor: string;
  looks: number;
  firstAt: string;
  lastAt: string;
};

export function evidenceBySensor(looks: readonly Look[]): SensorEvidence[] {
  const bySensor = new Map<string, Look[]>();
  for (const look of looks) {
    const bucket = bySensor.get(look.sensor);
    if (bucket) bucket.push(look);
    else bySensor.set(look.sensor, [look]);
  }
  return [...bySensor.entries()]
    .map(([sensor, list]) => {
      const times = list.map((l) => l.detected_at).sort();
      return {
        sensor,
        looks: distinctLooks(list),
        firstAt: times[0]!,
        lastAt: times.at(-1)!,
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
