import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Locale } from "@/i18n";
import { sourceStale } from "@/lib/freshness";
import type { DataSource } from "@/lib/nadhir";
import { relativeTime } from "@/lib/nadhir";

const STATUS = {
  ok: { color: "var(--risk-1)", Icon: CircleCheck },
  degraded: { color: "var(--risk-3)", Icon: CircleAlert },
  unavailable: { color: "var(--risk-5)", Icon: CircleX },
} as const;

export function SourceHealth({
  source,
  locale,
}: {
  source: DataSource;
  locale: Locale;
}) {
  const { t } = useTranslation();
  // A stored "ok" older than the source's cadence is a stopped scheduler, not health.
  const stale = sourceStale(source);
  const effective = stale ? "degraded" : source.status;
  const status = STATUS[effective] ?? STATUS.degraded;
  const { Icon } = status;

  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-1 border-b border-border px-4 py-3 last:border-b-0">
      <span className="flex min-w-44 items-center gap-2 font-medium">
        <Icon
          aria-hidden
          className="size-4 shrink-0"
          style={{ color: status.color }}
        />
        {source.label}
      </span>
      <span className="text-sm" style={{ color: status.color }}>
        {t(`status.${effective}`)}
      </span>
      <span className="tabular text-sm text-muted-foreground">
        {source.last_ok_at
          ? relativeTime(source.last_ok_at, locale)
          : t("common.none")}
      </span>
      {stale ? (
        <span
          className="w-full text-xs sm:w-auto sm:flex-1"
          style={{ color: "var(--risk-ink-3)" }}
        >
          {t("status.stale", {
            time: source.last_ok_at
              ? relativeTime(source.last_ok_at, locale)
              : t("common.none"),
          })}
        </span>
      ) : source.note ? (
        <span className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1">
          {source.note}
        </span>
      ) : null}
    </li>
  );
}
