import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { AnyLocale } from "@/i18n";
import { relativeTime } from "@/lib/nadhir";
import { memberDetailQuery } from "@/lib/roles";

export function MemberDetail({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.language as AnyLocale;
  const detail = useQuery(memberDetailQuery(userId));

  if (detail.isLoading) {
    return (
      <p className="text-xs text-muted-foreground">{t("queues.loading")}</p>
    );
  }

  if (detail.isError) {
    return (
      <p className="text-xs text-[var(--emergency)]">
        {(detail.error as Error).message}
      </p>
    );
  }

  const d = detail.data;
  if (!d) return null;

  return (
    <div className="grid gap-3 text-xs sm:grid-cols-2">
      <div>
        <p className="font-medium">{t("people.reachability")}</p>
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          <li>
            {t("people.alertEmail")}: {d.alert_email ? "✓" : "—"}
          </li>
          <li>
            {t("people.alertPush")}: {d.alert_push ? "✓" : "—"}
          </li>
          <li>
            {t("people.phoneOnFile")}: {d.has_phone ? "✓" : "—"}
          </li>
          <li>
            {t("people.minDanger")}: {d.min_danger_level ?? "—"}
          </li>
          <li>{t("people.alertsReceived", { count: d.alerts_received })}</li>
        </ul>
      </div>

      <div>
        <p className="font-medium">{t("people.zones")}</p>
        {d.zones.length === 0 ? (
          <p className="mt-1 text-muted-foreground">{t("people.noZones")}</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {d.zones.map((z) => (
              <li key={z.id}>{z.name ?? t("people.unnamedZone")}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="sm:col-span-2">
        <p className="font-medium">{t("people.recentActions")}</p>
        {d.recent_actions.length === 0 ? (
          <p className="mt-1 text-muted-foreground">{t("people.noActions")}</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {d.recent_actions.map((a, i) => (
              <li key={`${a.at}-${i}`}>
                {a.action}{" "}
                <span className="opacity-70">{relativeTime(a.at, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
