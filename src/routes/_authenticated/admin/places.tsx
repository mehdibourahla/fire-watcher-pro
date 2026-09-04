import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  openAreaCountsQuery,
  openAreasQuery,
  verifyOpenArea,
  type OpenArea,
} from "@/lib/admin-places";

export const Route = createFileRoute("/_authenticated/admin/places")({
  component: PlacesPage,
});

function PlacesPage() {
  const { t } = useTranslation("admin");
  const [verified, setVerified] = useState(false);
  const counts = useQuery(openAreaCountsQuery);
  const areas = useQuery(openAreasQuery(verified));

  return (
    <section>
      <h1 className="text-lg font-semibold">{t("places.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("places.subtitle")}
      </p>

      {counts.data ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("places.coverage", {
            verified: counts.data.verified,
            total: counts.data.total,
          })}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        {[false, true].map((flag) => (
          <button
            key={String(flag)}
            type="button"
            onClick={() => setVerified(flag)}
            aria-pressed={verified === flag}
            className={
              verified === flag
                ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
            }
          >
            {flag ? t("places.filterVerified") : t("places.filterUnverified")}
          </button>
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {(areas.data ?? []).map((area) => (
          <AreaRow key={area.id} area={area} />
        ))}
      </ul>
    </section>
  );
}

function AreaRow({ area }: { area: OpenArea }) {
  const { t } = useTranslation("admin");
  const qc = useQueryClient();
  const [note, setNote] = useState("");

  const verify = useMutation({
    mutationFn: () => verifyOpenArea(area.id, note.trim() || null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "places"] }),
  });

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <span>
        {area.name ?? t("places.unnamed")}
        <span className="ml-2 text-xs text-muted-foreground">
          {area.area_type} · {area.lat.toFixed(3)}, {area.lon.toFixed(3)}
        </span>
      </span>
      {area.verified_at ? (
        <span className="text-xs text-muted-foreground">
          {area.verified_note ?? t("places.verified")}
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("places.notePlaceholder")}
            className="min-w-40 rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={verify.isPending}
            onClick={() => verify.mutate()}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {t("places.verify")}
          </button>
        </span>
      )}
    </li>
  );
}
