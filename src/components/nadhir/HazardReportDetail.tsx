import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { relativeTime } from "@/lib/nadhir";
import type { HazardReport } from "@/lib/open-areas";
import { ReportMutationError, witnessReport } from "@/lib/reports";

type Props = { report: HazardReport; locale: Locale; now: number };

export function HazardReportDetail({ report, locale, now }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-muted-foreground">
        {t("reports.citizenLabel")}
      </p>
      <h2 className="text-lg font-semibold">
        {t(`reports.hazardName.${report.hazard ?? "other"}`)}
      </h2>
      {report.summary ? <p className="text-sm">{report.summary}</p> : null}
      <p className="text-sm">
        <time dateTime={report.observed_at}>
          {t("map.reportObserved", {
            time: relativeTime(report.observed_at, locale, now),
          })}
        </time>
        {report.witnesses
          ? ` · ${t("reports.witnessCount", { count: report.witnesses })}`
          : ""}
      </p>
      <Witness reportId={report.id} />
      <p className="text-xs text-muted-foreground">{t("map.reportNote")}</p>
    </div>
  );
}

function Witness({ reportId }: { reportId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [state, setState] = useState<
    "idle" | "busy" | "seen" | "gone" | "signin"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const here = useLocation({ select: (location) => location.href });

  async function vote(choice: "seen" | "gone") {
    setError(null);
    setState("busy");
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setState("signin");
    if (!navigator.geolocation) {
      setError("reports.witnessLocate");
      return setState("idle");
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await witnessReport(reportId, choice, {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          });
          setState(choice);
          void qc.invalidateQueries({ queryKey: ["hazard_reports"] });
        } catch (failure) {
          setError(
            failure instanceof ReportMutationError
              ? failure.message
              : "reports.witnessFailed",
          );
          setState("idle");
        }
      },
      () => {
        setError("reports.witnessLocate");
        setState("idle");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  if (state === "seen" || state === "gone")
    return (
      <p role="status" className="text-sm font-medium">
        {state === "seen"
          ? t("reports.witnessThanks")
          : t("reports.witnessGoneThanks")}
      </p>
    );
  if (state === "signin")
    return (
      <Link
        to="/auth"
        search={{ returnTo: here }}
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
      >
        {t("reports.witnessSignIn")}
      </Link>
    );
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          className="h-11 flex-1"
          disabled={state === "busy"}
          onClick={() => void vote("seen")}
        >
          {t("reports.witnessSeen")}
        </Button>
        <Button
          variant="outline"
          className="h-11 flex-1"
          disabled={state === "busy"}
          onClick={() => void vote("gone")}
        >
          {t("reports.witnessGone")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}
