import { useTranslation } from "react-i18next";

import type { Locale } from "@/i18n";
import { relativeTime } from "@/lib/nadhir";
import type { HazardReport } from "@/lib/open-areas";

type Props = { report: HazardReport; locale: Locale; now: number };

const SIGHTING_KEY = {
  smoke: "reports.sightingSmoke",
  flames: "reports.sightingFlames",
  smell: "reports.sightingSmell",
  other: "reports.sightingOther",
} as const;

export function HazardReportDetail({ report, locale, now }: Props) {
  const { t } = useTranslation();
  const label =
    report.kind === "road_blocked"
      ? t("survival.reportRoadBlocked")
      : report.kind === "person_trapped"
        ? t("survival.reportPersonTrapped")
        : t(SIGHTING_KEY[report.sighting]);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {t("map.reportEyebrow")}
      </p>
      <h2 className="text-lg font-semibold">{label}</h2>
      <p className="text-sm">
        <time dateTime={report.observed_at}>
          {t("map.reportObserved", {
            time: relativeTime(report.observed_at, locale, now),
          })}
        </time>
      </p>
      <p className="text-xs text-muted-foreground">
        {t("map.reportUnverified")}
      </p>
    </div>
  );
}
