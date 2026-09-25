import {
  Activity,
  CloudLightning,
  Flame,
  LifeBuoy,
  MessageSquareText,
  TrafficCone,
  Waves,
  type LucideIcon,
} from "lucide-react";

import type { ReportKind } from "@/lib/reports";

export const TILES: { kind: ReportKind; Icon: LucideIcon }[] = [
  { kind: "sighting", Icon: Flame },
  { kind: "flooding", Icon: Waves },
  { kind: "storm_damage", Icon: CloudLightning },
  { kind: "road_blocked", Icon: TrafficCone },
  { kind: "earthquake", Icon: Activity },
  { kind: "person_trapped", Icon: LifeBuoy },
  { kind: "other", Icon: MessageSquareText },
];
