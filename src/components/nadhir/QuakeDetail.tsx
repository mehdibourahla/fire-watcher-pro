import { useTranslation } from "react-i18next";

import type { Locale } from "@/i18n";
import type { Earthquake } from "@/lib/earthquakes";
import { relativeTime } from "@/lib/nadhir";

type Props = { quake: Earthquake; place: string; locale: Locale; now: number };

export function QuakeDetail({ quake, place, locale, now }: Props) {
  const { t } = useTranslation();
  const magnitude = quake.magnitude.toFixed(1);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-muted-foreground">
        {t("quake.eyebrow")}
      </p>
      <h2 className="text-lg font-semibold">
        {t("quake.title", { mag: magnitude })}
      </h2>
      <p dir="auto" className="text-sm text-muted-foreground">
        {place}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t("quake.time")}</dt>
        <dd>
          <time dateTime={quake.occurred_at}>
            {relativeTime(quake.occurred_at, locale, now)}
          </time>
        </dd>
        <dt className="text-muted-foreground">{t("quake.magnitude")}</dt>
        <dd className="tabular-nums" dir="ltr">
          {magnitude}
          {quake.magnitude_type ? ` ${quake.magnitude_type}` : ""}
        </dd>
        {quake.depth_km !== null ? (
          <>
            <dt className="text-muted-foreground">{t("quake.depth")}</dt>
            <dd className="tabular-nums">
              {t("quake.depthKm", { km: Math.round(quake.depth_km) })}
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">{t("quake.network")}</dt>
        <dd>{t("quake.recordedBy", { network: quake.network ?? "EMSC" })}</dd>
      </dl>
      <section aria-labelledby="quake-guidance" className="card p-3 text-sm">
        <h3 id="quake-guidance" className="mb-2 font-medium">
          {t("quake.guidanceTitle")}
        </h3>
        <ul className="list-disc space-y-1 ps-5">
          <li>{t("quake.guidanceShaking")}</li>
          <li>{t("quake.guidanceAfter")}</li>
          <li>{t("quake.guidanceCall")}</li>
          {quake.offshore && quake.magnitude >= 5 ? (
            <li className="font-medium">{t("quake.guidanceCoast")}</li>
          ) : null}
        </ul>
      </section>
      <p className="text-xs text-muted-foreground">{t("quake.note")}</p>
    </div>
  );
}
