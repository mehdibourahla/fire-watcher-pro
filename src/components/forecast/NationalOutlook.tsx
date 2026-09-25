import { useState } from "react";
import { useTranslation } from "react-i18next";

import { riskInk, riskTint } from "@/components/nadhir/risk-visuals";
import { ErrorState, SkeletonList } from "@/components/nadhir/states";
import type { Locale } from "@/i18n";
import type { WilayaOutlook } from "@/lib/forecast-outlook";
import { dangerLevelKey, unitName } from "@/lib/nadhir";

const FIRST = 8;

export function NationalOutlook({
  rows,
  loading,
  failed,
  onRetry,
  onPick,
}: {
  rows: WilayaOutlook[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onPick: (row: WilayaOutlook) => void;
}) {
  const { t, i18n } = useTranslation("weather");
  const locale = i18n.language as Locale;
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, FIRST);

  return (
    <section aria-labelledby="national-title" className="mt-12">
      <h2 id="national-title" className="text-xl">
        {t("outlook.nationalTitle")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("outlook.nationalBody")}
      </p>
      {loading ? (
        <SkeletonList rows={4} className="mt-4" />
      ) : failed ? (
        <ErrorState
          body={t("outlook.nationalError")}
          onRetry={onRetry}
          className="mt-4"
        />
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm">{t("outlook.nationalEmpty")}</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {shown.map((row) => (
              <li key={row.wilaya.id}>
                <button
                  type="button"
                  onClick={() => onPick(row)}
                  className="flex min-h-11 w-full flex-wrap items-center gap-x-4 gap-y-1.5 py-3 text-start hover:bg-muted"
                >
                  <span
                    aria-hidden
                    className="tabular inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold"
                    style={{
                      backgroundColor: riskTint(row.level),
                      color: riskInk(row.level),
                    }}
                  >
                    {row.level}
                  </span>
                  <span className="min-w-32 flex-1 font-medium">
                    {unitName(row.wilaya, locale)}
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    {row.weather ? (
                      <span>
                        {t(`outlook.onmLevel.${row.weather.level}`)}:{" "}
                        {row.weather.events
                          .map((e) => t(`outlook.event.${e}`))
                          .join(t("outlook.separator"))}
                      </span>
                    ) : null}
                    {row.fire != null ? (
                      <span>
                        {t("outlook.nationalFire", {
                          level: t(
                            `translation:risk.${dangerLevelKey(row.fire)}`,
                          ),
                        })}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {rows.length > FIRST && !all ? (
            <button
              type="button"
              onClick={() => setAll(true)}
              className="mt-3 min-h-11 text-sm font-medium text-primary underline"
            >
              {t("outlook.nationalMore", { count: rows.length })}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
