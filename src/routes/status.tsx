import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { SourceHealth } from "@/components/nadhir/SourceHealth";
import { SkeletonList } from "@/components/nadhir/states";
import type { Locale } from "@/i18n";
import { sourceHealthQuery } from "@/lib/nadhir";
import { summariseSourceHealth } from "@/lib/source-health";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "Data source health — Nadhir Algeria" },
      {
        name: "description",
        content:
          "Live health of the satellite, weather and geodata feeds powering Nadhir's wildfire warnings.",
      },
      { property: "og:title", content: "Data source health — Nadhir Algeria" },
      {
        property: "og:description",
        content: "Honest status reporting for every data feed behind Nadhir.",
      },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(sourceHealthQuery),
  component: StatusPage,
});

function StatusPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const sources = useQuery(sourceHealthQuery);

  const summary = summariseSourceHealth(sources.data ?? []);

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6">
      <h1 className="text-2xl">{t("status.title")}</h1>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        {t("status.subtitle")}
      </p>

      {sources.isError ? (
        <p
          role="alert"
          className="mt-4 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor: "var(--emergency-surface)",
            color: "var(--emergency)",
          }}
        >
          {t("status.state.unavailable")}
        </p>
      ) : summary.affected > 0 ? (
        <p
          role="status"
          className="mt-4 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor: "var(--emergency-surface)",
            color: "var(--emergency)",
          }}
        >
          {t("status.degradedCount", { count: summary.affected })}
        </p>
      ) : null}

      {sources.isLoading ? (
        <SkeletonList rows={4} className="mt-5" />
      ) : sources.isError ? null : (
        <ul className="card mt-5">
          {(sources.data ?? []).map((source) => (
            <SourceHealth key={source.key} source={source} locale={locale} />
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted-foreground">{t("status.note")}</p>
    </div>
  );
}
