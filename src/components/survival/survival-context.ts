import { createContext, useContext } from "react";

import type { SurvivalPack } from "@/lib/survival-pack";

export type SurvivalState = {
  online: boolean;
  position: { lat: number; lon: number } | null;
  positionDenied: boolean;
  pack: SurvivalPack | null;
  setPack: (pack: SurvivalPack) => void;
};

export const SurvivalContext = createContext<SurvivalState | null>(null);

export function useSurvival(): SurvivalState {
  const ctx = useContext(SurvivalContext);
  if (!ctx) throw new Error("useSurvival used outside the /survival layout");
  return ctx;
}
