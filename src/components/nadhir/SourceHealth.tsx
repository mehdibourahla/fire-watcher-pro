import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Locale } from "@/i18n";
import { relativeTime } from "@/lib/nadhir";
import type { SourceHealth as SourceHealthModel } from "@/lib/source-health";

const STATUS = {
  healthy: { color: "var(--risk-1)", Icon: CircleCheck },
  delayed: { color: "var(--risk-3)", Icon: CircleAlert },
  degraded: { color: "var(--risk-3)", Icon: CircleAlert },
  stale: { color: "var(--risk-4)", Icon: CircleX },
  unavailable: { color: "var(--risk-5)", Icon: CircleX },
  backfilling: { color: "var(--risk-2)", Icon: CircleAlert },
  paused: { color: "var(--muted-foreground)", Icon: CircleAlert },
} as const;

export function SourceHealth({
  source,
  locale,
}: {
  source: SourceHealthModel;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const status = STATUS[source.state] ?? STATUS.degraded;
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
        {t(`status.state.${source.state}`)}
      </span>
      <span className="tabular text-sm text-muted-foreground">
        {source.valid_at
          ? t("status.validAge", {
              time: relativeTime(source.valid_at, locale),
            })
          : t("status.noValidData")}
      </span>
      <span className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1">
        {source.last_success_at
          ? t("status.lastSuccessAt", {
              time: relativeTime(source.last_success_at, locale),
            })
          : t("status.neverValidated")}
        {source.records_expected != null
          ? ` · ${t("status.coverage", {
              accepted: source.records_accepted,
              expected: source.records_expected,
            })}`
          : ""}
        {source.fallback_contract_key
          ? ` · ${t("status.fallback", {
              source: source.fallback_contract_key,
            })}`
          : ""}
        {source.public_reason_code
          ? ` · ${t(`status.reason.${source.public_reason_code}`)}`
          : ""}
      </span>
    </li>
  );
}
