import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ChevronLeft, Share2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSurvival } from "@/components/survival/survival-context";
import type { Locale } from "@/i18n";
import { adminUnitsQuery, settlementsQuery } from "@/lib/nadhir";
import {
  checkInMessage,
  positionCard,
  type PositionCard,
} from "@/lib/survival";

export const Route = createFileRoute("/survival/checkin")({
  component: CheckInPage,
});

function CheckInPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { online, position, pack } = useSurvival();
  const [kind, setKind] = useState<"ok" | "assist">("ok");

  const units = useQuery({ ...adminUnitsQuery, retry: online ? 3 : false });
  const settlements = useQuery({
    ...settlementsQuery,
    retry: online ? 3 : false,
  });

  const card = useMemo<PositionCard | null>(() => {
    if (position && units.data && settlements.data)
      return positionCard(
        position.lat,
        position.lon,
        units.data,
        settlements.data,
        locale,
      );
    if (pack)
      return {
        commune: pack.commune,
        wilaya: pack.wilaya,
        nearest: pack.nearest,
        coords: pack.coords,
      };
    return null;
  }, [position, units.data, settlements.data, pack, locale]);

  const message = useMemo(() => {
    if (!card) return null;
    const time = new Intl.DateTimeFormat("fr-DZ", {
      timeZone: "Africa/Algiers",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
    return checkInMessage({
      kind,
      name: null,
      card,
      time,
      t: (k, o) => (o ? t(k, o) : t(k)),
    });
  }, [kind, card, t]);

  const onSend = () => {
    if (!message) return;
    if (navigator.share) {
      void navigator.share({ text: message }).catch(() => undefined);
    } else {
      window.location.href = `sms:?&body=${encodeURIComponent(message)}`;
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Link
          to="/survival"
          className="rounded-md p-1.5 hover:bg-muted"
          aria-label={t("common.back")}
        >
          <ChevronLeft aria-hidden className="size-5 rtl:rotate-180" />
        </Link>
        <h1 className="font-display text-xl">{t("survival.checkinTitle")}</h1>
      </div>

      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {t("survival.checkinIntro")}
      </p>

      <button
        type="button"
        onClick={() => setKind("ok")}
        aria-pressed={kind === "ok"}
        className="flex items-center gap-3 rounded-xl border p-4 text-start"
        style={
          kind === "ok"
            ? {
                backgroundColor: "var(--accent-tint)",
                borderColor: "var(--accent)",
              }
            : {
                borderColor: "var(--border)",
                backgroundColor: "var(--surface)",
              }
        }
      >
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--surface)", color: "var(--accent)" }}
        >
          <CheckCircle2 aria-hidden className="size-5" />
        </span>
        <span className="flex flex-col gap-0.5">
          <span
            className="text-base font-bold"
            style={kind === "ok" ? { color: "var(--accent)" } : undefined}
          >
            {t("survival.checkinOk")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("survival.checkinOkSub")}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => setKind("assist")}
        aria-pressed={kind === "assist"}
        className="flex items-center gap-3 rounded-xl border p-4 text-start"
        style={
          kind === "assist"
            ? {
                backgroundColor: "var(--emergency-surface)",
                borderColor: "var(--emergency)",
              }
            : {
                borderColor: "var(--border)",
                backgroundColor: "var(--surface)",
              }
        }
      >
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: "var(--surface)",
            color: "var(--emergency)",
          }}
        >
          <TriangleAlert aria-hidden className="size-5" />
        </span>
        <span className="flex flex-col gap-0.5">
          <span
            className="text-base font-bold"
            style={
              kind === "assist" ? { color: "var(--emergency)" } : undefined
            }
          >
            {t("survival.checkinAssist")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("survival.checkinAssistSub")}
          </span>
        </span>
      </button>

      <section className="flex flex-col gap-2">
        <h2 className="text-[11px] font-bold tracking-wider text-muted-foreground">
          {t("survival.checkinPreview").toUpperCase()}
        </h2>
        <p className="rounded-lg bg-muted px-3.5 py-3 text-sm leading-relaxed">
          {message ?? t("survival.noPosition")}
        </p>
      </section>

      <div className="mt-auto flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onSend}
          disabled={!message}
          className="flex h-14 items-center justify-center gap-2.5 rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-50"
        >
          <Share2 aria-hidden className="size-5" />
          {t("survival.checkinSend")}
        </button>
        <p className="px-2 text-center text-xs leading-relaxed text-muted-foreground">
          {t("survival.checkinNote")}
        </p>
      </div>
    </>
  );
}
