import type { Contribution } from "@/lib/reports";

export const LEVELS = [
  { key: "observer", min: 0 },
  { key: "witness", min: 30 },
  { key: "guardian", min: 100 },
  { key: "sentinel", min: 300 },
] as const;

export type LevelKey = (typeof LEVELS)[number]["key"];

export function levelFor(points: number) {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++)
    if (points >= LEVELS[i]!.min) index = i;
  const current = LEVELS[index]!;
  const next = LEVELS[index + 1] ?? null;
  return {
    current: current.key as LevelKey,
    next: next?.key ?? null,
    toNext: next ? next.min - points : 0,
    progress: next ? (points - current.min) / (next.min - current.min) : 1,
  };
}

const BADGES = [
  { key: "firstCorroborated", of: "corroborated", need: 1 },
  { key: "fiveConfirmations", of: "confirmations", need: 5 },
  { key: "threeHazards", of: "hazards", need: 3 },
  { key: "alertedPeople", of: "alerted", need: 1 },
] as const;

export type Badge = {
  key: (typeof BADGES)[number]["key"];
  have: number;
  need: number;
  earned: boolean;
};

export function badgesFor(c: Contribution): Badge[] {
  return BADGES.map((b) => ({
    key: b.key,
    have: Math.min(c[b.of], b.need),
    need: b.need,
    earned: c[b.of] >= b.need,
  }));
}

export function nextBadge(c: Contribution): Badge | null {
  return (
    badgesFor(c)
      .filter((b) => !b.earned)
      .sort((a, b) => b.have / b.need - a.have / a.need)[0] ?? null
  );
}
