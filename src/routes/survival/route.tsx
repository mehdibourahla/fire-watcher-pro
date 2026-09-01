import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock, WifiOff, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { EmergencyNumbers } from "@/components/SiteChrome";
import {
  SurvivalContext,
  type SurvivalState,
} from "@/components/survival/survival-context";
import type { Locale } from "@/i18n";
import { relativeTime } from "@/lib/nadhir";
import { SURVIVAL_ACTIVE_KEY } from "@/lib/survival";
import { loadPack, savePack, type SurvivalPack } from "@/lib/survival-pack";
import { titledMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/survival")({
  ssr: false,
  head: () => ({
    meta: titledMeta("survival.mode"),
  }),
  component: SurvivalLayout,
});

function SurvivalLayout() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const navigate = useNavigate();

  const [online, setOnline] = useState(() => navigator.onLine);
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(
    null,
  );
  const [positionDenied, setPositionDenied] = useState(false);
  const [pack, setPackState] = useState<SurvivalPack | null>(() =>
    loadPack(localStorage),
  );
  const [confirmExit, setConfirmExit] = useState(false);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setPositionDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setPositionDenied(true),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }, []);

  const state = useMemo<SurvivalState>(
    () => ({
      online,
      position,
      positionDenied,
      pack,
      setPack: (p) => {
        savePack(localStorage, p);
        setPackState(p);
      },
    }),
    [online, position, positionDenied, pack],
  );

  return (
    <SurvivalContext.Provider value={state}>
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-background">
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: "var(--emergency)" }}
            />
            <span className="text-xs font-bold tracking-widest">
              {t("survival.mode").toUpperCase()}
            </span>
          </span>
          <span className="flex items-center gap-3">
            <span
              className="flex items-center gap-1.5 text-xs"
              style={online ? undefined : { color: "var(--risk-ink-2)" }}
            >
              {online ? null : <WifiOff aria-hidden className="size-3.5" />}
              {online ? (
                <span className="text-muted-foreground">
                  {t("survival.online")}
                </span>
              ) : (
                <span className="font-semibold">{t("survival.offline")}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setConfirmExit(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              <X aria-hidden className="size-3.5" />
              {t("survival.exit")}
            </button>
          </span>
        </header>

        {online ? null : (
          <p
            role="status"
            className="flex items-center gap-2 px-4 py-2 text-xs"
            style={{
              backgroundColor: "var(--risk-tint-2)",
              color: "var(--risk-ink-2)",
            }}
          >
            <Clock aria-hidden className="size-3.5 shrink-0" />
            {t("survival.offlineBanner", {
              time: pack
                ? relativeTime(pack.saved_at, locale)
                : t("common.none"),
            })}
          </p>
        )}

        <div className="flex flex-1 flex-col gap-3 p-4">
          <Outlet />
        </div>

        <div className="p-4 pt-0">
          <EmergencyNumbers compact />
        </div>

        {confirmExit ? (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-4 sm:items-center">
            <div className="card-raised w-full max-w-sm p-5">
              <h2 className="font-display text-xl">
                {t("survival.exitTitle")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("survival.exitBody")}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(SURVIVAL_ACTIVE_KEY);
                    void navigate({ to: "/" });
                  }}
                  className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                >
                  {t("survival.exitYes")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmExit(false)}
                  className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium"
                >
                  {t("survival.enterCancel")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </SurvivalContext.Provider>
  );
}
