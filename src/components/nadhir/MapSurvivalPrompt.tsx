import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Flame } from "lucide-react";
import { relativeTime, type FireCluster } from "@/lib/nadhir";
import type { Locale } from "@/i18n";
import {
  SURVIVAL_ACTIVE_KEY,
  SURVIVAL_AUTO_KM,
  SURVIVAL_DISMISS_KEY,
  nearestThreat,
} from "@/lib/survival";

export function MapSurvivalPrompt({
  fires,
  now,
}: {
  fires: FireCluster[];
  now: number;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const navigate = useNavigate();
  const [interstitial, setInterstitial] = useState<{
    km: number;
    seen: string;
  } | null>(null);

  useEffect(() => {
    const data = fires;
    if (!data || typeof navigator === "undefined") return;
    if (!("permissions" in navigator) || !("geolocation" in navigator)) return;
    if (localStorage.getItem(SURVIVAL_ACTIVE_KEY)) return;
    if (sessionStorage.getItem(SURVIVAL_DISMISS_KEY)) return;
    let cancelled = false;
    // Only an already-granted permission is used: the map never prompts for location.
    void navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled || status.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            const threat = nearestThreat(
              pos.coords.latitude,
              pos.coords.longitude,
              data,
            );
            if (
              threat &&
              threat.cluster.state === "active" &&
              threat.km <= SURVIVAL_AUTO_KM
            )
              setInterstitial({
                km: threat.km,
                seen: threat.cluster.last_detected_at,
              });
          },
          () => undefined,
          { timeout: 10000, maximumAge: 300000 },
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fires]);

  return (
    <>
      {interstitial ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-surface">
          <div
            className="h-1.5"
            style={{ backgroundColor: "var(--emergency)" }}
          />
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6">
            <span
              className="flex size-16 items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--emergency-surface)" }}
            >
              <Flame
                aria-hidden
                className="size-8"
                style={{ color: "var(--emergency)" }}
              />
            </span>
            <h2 className="font-display text-3xl leading-tight">
              {t("survival.interTitle")}
            </h2>
            <p className="text-[15px] leading-relaxed">
              {t("survival.interBody", { km: interstitial.km.toFixed(1) })}
            </p>
            <dl className="card flex flex-col gap-1.5 p-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {t("survival.interBasedOn")}
                </dt>
                <dd className="font-semibold">{t("survival.interPosition")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {t("survival.interObservation")}
                </dt>
                <dd className="font-semibold">
                  {t("survival.interSatellite", {
                    time: relativeTime(interstitial.seen, locale, now),
                  })}
                </dd>
              </div>
            </dl>
          </div>
          <div className="mx-auto flex w-full max-w-md flex-col gap-2.5 px-6 pb-8">
            <button
              type="button"
              onClick={() => {
                localStorage.setItem(
                  SURVIVAL_ACTIVE_KEY,
                  new Date().toISOString(),
                );
                void navigate({ to: "/survival" });
              }}
              className="flex h-14 items-center justify-center gap-2 rounded-xl text-base font-bold"
              style={{
                backgroundColor: "var(--emergency)",
                color: "var(--surface)",
              }}
            >
              {t("survival.interEnter")}
            </button>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem(SURVIVAL_DISMISS_KEY, "1");
                setInterstitial(null);
              }}
              className="flex h-12 items-center justify-center rounded-xl border border-border text-sm font-semibold text-muted-foreground"
            >
              {t("survival.interNotHere")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
