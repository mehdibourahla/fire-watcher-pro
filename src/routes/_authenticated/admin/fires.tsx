import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/kit/ConfirmDialog";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { QueryState } from "@/components/admin/kit/QueryState";
import { SplitView } from "@/components/admin/kit/SplitView";
import { StatusBadge, type Tone } from "@/components/admin/kit/StatusBadge";
import { When } from "@/components/admin/kit/When";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  resolveFire,
  RESOLUTION_REASONS,
  unresolvedFiresQuery,
  type ResolutionReason,
  type UnresolvedFire,
} from "@/lib/admin-fires";
import { adminUnitsQuery } from "@/lib/nadhir";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/fires")({
  component: FiresPage,
});

const STATE_TONE: Record<string, Tone> = {
  active: "bad",
  unconfirmed: "warn",
  contained_guess: "neutral",
};

function usePlace() {
  const units = useQuery(adminUnitsQuery);
  const names = useMemo(
    () => new Map((units.data ?? []).map((unit) => [unit.id, unit.name_fr])),
    [units.data],
  );
  return (fire: UnresolvedFire) =>
    [fire.commune_id, fire.wilaya_id]
      .map((id) => (id ? names.get(id) : undefined))
      .filter(Boolean)
      .join(" — ") || `${fire.lat.toFixed(3)}, ${fire.lon.toFixed(3)}`;
}

function Detail({
  fire,
  place,
  onDone,
}: {
  fire: UnresolvedFire;
  place: string;
  onDone: () => void;
}) {
  const { t } = useTranslation("admin");
  const qc = useQueryClient();
  const [reason, setReason] = useState<ResolutionReason | null>(null);
  const [note, setNote] = useState("");
  const resolve = useMutation({
    mutationFn: (state: "extinguished" | "false_positive") =>
      resolveFire({
        id: fire.id,
        state,
        reason: state === "false_positive" ? reason : null,
        note: note.trim() || null,
        expectedUpdatedAt: fire.updated_at,
      }),
    onSuccess: async () => {
      toast.success(t("fires.resolved"));
      await qc.invalidateQueries({ queryKey: ["admin"] });
      onDone();
    },
  });
  const failure = (error: Error) =>
    error.message.includes("stale_write")
      ? new Error(t("fires.staleWrite"))
      : error;

  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge tone={STATE_TONE[fire.state] ?? "neutral"}>
          {t(`fires.state_${fire.state}`)}
        </StatusBadge>
        <a
          className="inline-flex items-center gap-1 underline"
          href={`/?event=fire%3A${fire.id}`}
        >
          <MapPin aria-hidden className="size-3.5" />
          {t("fires.openMap")}
        </a>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">{t("fires.place")}</dt>
        <dd>{place}</dd>
        <dt className="text-muted-foreground">{t("fires.firstSeen")}</dt>
        <dd>
          <When at={fire.first_detected_at} />
        </dd>
        <dt className="text-muted-foreground">{t("fires.lastSeen")}</dt>
        <dd>
          <When at={fire.last_detected_at} />
        </dd>
        <dt className="text-muted-foreground">{t("fires.detections")}</dt>
        <dd className="tabular-nums">{fire.detection_count ?? "—"}</dd>
        <dt className="text-muted-foreground">{t("fires.confidence")}</dt>
        <dd className="tabular-nums">
          {fire.confidence === null
            ? "—"
            : `${Math.round(fire.confidence * 100)} %`}
        </dd>
        <dt className="text-muted-foreground">{t("fires.frp")}</dt>
        <dd className="tabular-nums">
          {fire.max_frp_mw === null ? "—" : `${fire.max_frp_mw.toFixed(1)} MW`}
        </dd>
        <dt className="text-muted-foreground">{t("fires.sources")}</dt>
        <dd>{fire.sources?.join(", ") || "—"}</dd>
      </dl>
      <label className="block">
        <span className="font-medium">{t("fires.note")}</span>
        <Input
          className="mt-1"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <ConfirmDialog
          trigger={<Button>{t("fires.markEnded")}</Button>}
          title={t("fires.endedTitle", { id: fire.short_id })}
          description={t("fires.endedDescription")}
          confirmLabel={t("fires.markEnded")}
          onConfirm={async () => {
            try {
              await resolve.mutateAsync("extinguished");
            } catch (error) {
              throw failure(error as Error);
            }
          }}
        />
      </div>
      <fieldset className="space-y-2 border-t border-border pt-4">
        <legend className="pt-4 font-medium">{t("fires.markFalse")}</legend>
        <div className="grid grid-cols-2 gap-1">
          {RESOLUTION_REASONS.map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name={`reason-${fire.id}`}
                checked={reason === value}
                onChange={() => setReason(value)}
              />
              {t(`fires.reason_${value}`)}
            </label>
          ))}
        </div>
        <ConfirmDialog
          trigger={
            <Button variant="outline" disabled={!reason}>
              {t("fires.markFalse")}
            </Button>
          }
          title={t("fires.falseTitle", { id: fire.short_id })}
          description={
            reason
              ? t("fires.falseDescription", {
                  reason: t(`fires.reason_${reason}`),
                })
              : ""
          }
          confirmLabel={t("fires.markFalse")}
          destructive
          onConfirm={async () => {
            try {
              await resolve.mutateAsync("false_positive");
            } catch (error) {
              throw failure(error as Error);
            }
          }}
        />
      </fieldset>
    </div>
  );
}

function FiresPage() {
  const { t } = useTranslation("admin");
  const [strongOnly, setStrongOnly] = useState(true);
  const fires = useQuery(unresolvedFiresQuery(strongOnly));
  const place = usePlace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = fires.data?.find((fire) => fire.id === selectedId) ?? null;

  return (
    <section>
      <PageHeader title={t("fires.title")} description={t("fires.subtitle")} />
      <label className="mb-4 flex items-center gap-2 text-sm">
        <Checkbox
          checked={strongOnly}
          onCheckedChange={(value) => setStrongOnly(value === true)}
        />
        {t("fires.strongOnly")}
      </label>
      <QueryState
        query={fires}
        isEmpty={(rows) => rows.length === 0}
        empty={t("fires.empty")}
      >
        {(rows) => (
          <SplitView
            detailTitle={t("fires.detailTitle")}
            placeholder={t("fires.placeholder")}
            onClose={() => setSelectedId(null)}
            detail={
              selected ? (
                <Detail
                  key={selected.id}
                  fire={selected}
                  place={place(selected)}
                  onDone={() => setSelectedId(null)}
                />
              ) : null
            }
            list={
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {rows.map((fire) => (
                  <li key={fire.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(fire.id)}
                      className={cn(
                        "block w-full px-4 py-3 text-start hover:bg-muted",
                        fire.id === selectedId && "bg-muted",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <StatusBadge tone={STATE_TONE[fire.state] ?? "neutral"}>
                          {t(`fires.state_${fire.state}`)}
                        </StatusBadge>
                        <span className="font-mono text-xs">
                          {fire.short_id}
                        </span>
                        <span className="ms-auto shrink-0 text-xs text-muted-foreground">
                          <When at={fire.last_detected_at} />
                        </span>
                      </span>
                      <span className="mt-1 flex gap-2 text-xs text-muted-foreground">
                        <span className="min-w-0 flex-1 truncate">
                          {place(fire)}
                        </span>
                        <span className="tabular-nums">
                          {fire.confidence === null
                            ? ""
                            : `${Math.round(fire.confidence * 100)} %`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            }
          />
        )}
      </QueryState>
    </section>
  );
}
