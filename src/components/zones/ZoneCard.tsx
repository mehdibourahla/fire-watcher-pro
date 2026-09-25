import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { RiskChip } from "@/components/nadhir/RiskChip";
import { PackPreparation } from "@/components/survival/PackPreparation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n";
import {
  deleteZone,
  isDefaultPoint,
  setZoneActive,
  ZONE_HAZARDS,
  type Zone,
  zoneFailureKey,
} from "@/lib/account";
import { unitName, type AdminUnit } from "@/lib/nadhir";

export function ZoneCard({
  zone,
  commune,
  nearby,
  prepareOffline,
  onEdit,
}: {
  zone: Zone;
  commune: AdminUnit | undefined;
  nearby: { count: number; nearestKm: number | null };
  prepareOffline: boolean;
  onEdit: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
      await qc.invalidateQueries({ queryKey: ["zones"] });
    } catch (failure) {
      console.error(failure);
      setError(t(zoneFailureKey(failure)));
    } finally {
      setPending(false);
    }
  };

  const follows = ZONE_HAZARDS.filter(({ key }) => zone[key]).map(({ label }) =>
    t(label),
  );

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{zone.name}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[
              commune ? unitName(commune, i18n.language as Locale) : null,
              `${zone.radius_km} ${t("common.km")}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">
            {t("account.minLevel")}
          </span>
          <RiskChip level={zone.min_danger_level} />
        </div>
      </div>
      {isDefaultPoint(zone) ? (
        <div
          role="alert"
          className="mt-3 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor: "var(--emergency-surface)",
            color: "var(--emergency-ink)",
          }}
        >
          <p>{t("account.zoneDefaultPoint")}</p>
          <Button size="sm" className="mt-2" onClick={onEdit}>
            {t("account.zoneMove")}
          </Button>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        {follows.length
          ? t("account.zoneFollows", { list: follows.join(" · ") })
          : t("account.zoneFollowsNothing")}
      </p>
      <p className="mt-3 text-sm">
        {nearby.count === 0 || nearby.nearestKm === null
          ? t("account.zoneClear")
          : t("account.zoneFires", {
              count: nearby.count,
              km: nearby.nearestKm.toFixed(1),
            })}
      </p>
      {!zone.active ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("account.paused")}
        </p>
      ) : null}
      <PackPreparation zone={zone} auto={prepareOffline} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          {t("account.edit")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => void run(() => setZoneActive(zone.id, !zone.active))}
        >
          {zone.active ? t("account.pause") : t("account.resume")}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              className="text-destructive"
            >
              {t("account.delete")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("account.deleteZoneTitle", { name: zone.name })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("account.deleteZoneBody")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: "destructive" })}
                onClick={() => void run(() => deleteZone(zone.id))}
              >
                {t("account.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </article>
  );
}
