import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RiskLegend } from "@/components/SiteChrome";
import { supabase } from "@/integrations/supabase/client";
import type { Locale } from "@/i18n";
import { zonesQuery, type Zone } from "@/lib/account";
import {
  LIVE_STATES,
  adminUnitsQuery,
  clustersQuery,
  haversineKm,
  riskColorVar,
  unitName,
} from "@/lib/nadhir";

export const Route = createFileRoute("/_authenticated/zones")({
  head: () => ({
    meta: [
      { title: "My watch zones — Nadhir" },
      {
        name: "description",
        content:
          "Manage the villages, farms and forests you want Nadhir to watch for wildfires in Algeria.",
      },
      { property: "og:title", content: "My watch zones — Nadhir" },
      {
        property: "og:description",
        content: "Save places and choose when Nadhir should warn you.",
      },
    ],
  }),
  component: ZonesPage,
});

const MAX_ZONES = 10;

const EMPTY = {
  name: "",
  commune_id: "",
  lat: "36.7",
  lon: "4.05",
  radius_km: "10",
  min_danger_level: "3",
  notify_fires: true,
  notify_risk: true,
};

function ZonesPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const qc = useQueryClient();
  const zones = useQuery(zonesQuery);
  const units = useQuery(adminUnitsQuery);
  const clusters = useQuery(clustersQuery);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const communes = useMemo(
    () => (units.data ?? []).filter((u) => u.level === "commune"),
    [units.data],
  );

  const liveClusters = useMemo(
    () => (clusters.data ?? []).filter((c) => LIVE_STATES.includes(c.state)),
    [clusters.data],
  );

  const atLimit = (zones.data ?? []).length >= MAX_ZONES;

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("no session");
      if ((zones.data ?? []).length >= MAX_ZONES)
        throw new Error(t("account.zoneLimit"));
      const { error: insertError } = await supabase.from("zones").insert({
        user_id: auth.user.id,
        name: form.name.trim(),
        lat: Number(form.lat),
        lon: Number(form.lon),
        radius_km: Number(form.radius_km),
        commune_id: form.commune_id || null,
        min_danger_level: Number(form.min_danger_level),
        notify_fires: form.notify_fires,
        notify_risk: form.notify_risk,
      });
      if (insertError) throw new Error(insertError.message);
    },
    onSuccess: () => {
      setForm(EMPTY);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["zones"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Zone> }) => {
      const { error: updateError } = await supabase
        .from("zones")
        .update(patch)
        .eq("id", id);
      if (updateError) throw new Error(updateError.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["zones"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await supabase
        .from("zones")
        .delete()
        .eq("id", id);
      if (deleteError) throw new Error(deleteError.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["zones"] }),
  });

  function pickCommune(id: string) {
    const commune = communes.find((c) => c.id === id);
    setForm((f) => ({
      ...f,
      commune_id: id,
      name: f.name || (commune ? unitName(commune, locale) : f.name),
      lat: commune ? String(commune.lat) : f.lat,
      lon: commune ? String(commune.lon) : f.lon,
    }));
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6">
      <h1 className="text-2xl">{t("account.zonesTitle")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("account.zonesSubtitle")}
      </p>
      <Link
        to="/settings"
        className="mt-2 inline-block text-sm text-primary underline underline-offset-2"
      >
        {t("account.settingsTitle")}
      </Link>

      <div className="mt-5 grid gap-5 lg:grid-cols-[380px_1fr]">
        <section className="panel p-4">
          <h2 className="text-base font-semibold">{t("account.newZone")}</h2>
          <form
            className="mt-3 space-y-3 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <label className="block">
              <span className="mb-1 block text-muted-foreground">
                {t("account.zoneCommune")}
              </span>
              <select
                value={form.commune_id}
                onChange={(e) => pickCommune(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              >
                <option value="">{t("account.zoneCustom")}</option>
                {communes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {unitName(c, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-muted-foreground">
                {t("account.zoneName")}
              </span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-muted-foreground">
                  {t("account.lat")}
                </span>
                <input
                  required
                  inputMode="decimal"
                  value={form.lat}
                  onChange={(e) => setForm({ ...form, lat: e.target.value })}
                  className="tabular w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-muted-foreground">
                  {t("account.lon")}
                </span>
                <input
                  required
                  inputMode="decimal"
                  value={form.lon}
                  onChange={(e) => setForm({ ...form, lon: e.target.value })}
                  className="tabular w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-muted-foreground">
                {t("account.radius", { km: form.radius_km })}
              </span>
              <input
                type="range"
                min={2}
                max={60}
                step={1}
                value={form.radius_km}
                onChange={(e) =>
                  setForm({ ...form, radius_km: e.target.value })
                }
                className="w-full"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-muted-foreground">
                {t("account.minLevel")}
              </span>
              <select
                value={form.min_danger_level}
                onChange={(e) =>
                  setForm({ ...form, min_danger_level: e.target.value })
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              >
                {[1, 2, 3, 4, 5].map((l) => (
                  <option key={l} value={l}>
                    {l} —{" "}
                    {t(
                      `risk.${["low", "moderate", "high", "very_high", "extreme"][l - 1]}`,
                    )}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.notify_fires}
                  onChange={(e) =>
                    setForm({ ...form, notify_fires: e.target.checked })
                  }
                />
                {t("account.notifyFires")}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.notify_risk}
                  onChange={(e) =>
                    setForm({ ...form, notify_risk: e.target.checked })
                  }
                />
                {t("account.notifyRisk")}
              </label>
            </div>
            <button
              type="submit"
              disabled={create.isPending || atLimit}
              className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
            >
              {t("account.saveZone")}
            </button>
            <p className="tabular text-xs text-muted-foreground">
              {t("account.zoneCount", {
                used: (zones.data ?? []).length,
                max: MAX_ZONES,
              })}
            </p>
            {error ? (
              <p style={{ color: "var(--emergency)" }}>{error}</p>
            ) : null}
          </form>
          <RiskLegend className="mt-4" />
        </section>

        <section className="space-y-3">
          {zones.isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t("common.loading")}…
            </p>
          ) : null}
          {zones.data && zones.data.length === 0 ? (
            <p className="panel p-6 text-sm text-muted-foreground">
              {t("account.noZones")}
            </p>
          ) : null}
          {(zones.data ?? []).map((zone) => {
            const nearby = liveClusters
              .map((c) => ({
                c,
                km: haversineKm(zone.lat, zone.lon, c.lat, c.lon),
              }))
              .filter((x) => x.km <= zone.radius_km)
              .sort((a, b) => a.km - b.km);
            return (
              <article key={zone.id} className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">{zone.name}</h3>
                    <p className="tabular mt-0.5 text-xs text-muted-foreground">
                      {zone.lat.toFixed(3)}, {zone.lon.toFixed(3)} ·{" "}
                      {zone.radius_km} {t("common.km")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className="rounded-full px-2 py-0.5 font-medium text-background"
                      style={{
                        backgroundColor: riskColorVar(zone.min_danger_level),
                      }}
                    >
                      ≥ {zone.min_danger_level}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        update.mutate({
                          id: zone.id,
                          patch: { active: !zone.active },
                        })
                      }
                      className="rounded-md border border-border px-2 py-1 hover:bg-secondary"
                    >
                      {zone.active ? t("account.pause") : t("account.resume")}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove.mutate(zone.id)}
                      className="rounded-md border border-border px-2 py-1 hover:bg-secondary"
                      style={{ color: "var(--risk-5)" }}
                    >
                      {t("account.delete")}
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-sm">
                  {nearby.length === 0
                    ? t("account.zoneClear")
                    : t("account.zoneFires", {
                        count: nearby.length,
                        km: nearby[0]!.km.toFixed(1),
                      })}
                </p>
                {!zone.active ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("account.paused")}
                  </p>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
