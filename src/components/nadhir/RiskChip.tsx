import { useTranslation } from "react-i18next";

import { dangerLevelKey } from "@/lib/nadhir";
import { cn } from "@/lib/utils";

import { RISK_ICON, clampLevel, riskInk, riskTint } from "./risk-visuals";

type Props = {
  level: number;
  showName?: boolean;
  fuelLimited?: boolean;
  className?: string;
};

export function RiskChip({
  level,
  showName = true,
  fuelLimited = false,
  className,
}: Props) {
  const { t } = useTranslation();
  const current = clampLevel(level);
  const Icon = RISK_ICON[current];
  const name = t(`risk.${dangerLevelKey(current)}`);

  if (fuelLimited)
    return (
      <span
        title={t("explain.notRated")}
        className={cn(
          "inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground",
          className,
        )}
      >
        {t("risk.fuelLimited")}
      </span>
    );

  return (
    <span
      title={t("explain.dangerLevel")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        className,
      )}
      style={{ backgroundColor: riskTint(current), color: riskInk(current) }}
    >
      <Icon aria-hidden className="size-3.5" />
      <span className="tabular">{current}</span>
      {showName ? <span>{name}</span> : <span className="sr-only">{name}</span>}
    </span>
  );
}
