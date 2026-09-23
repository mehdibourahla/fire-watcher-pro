import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { adminUnitsQuery } from "@/lib/nadhir";
import type { CivilDecision } from "@/lib/civil-agent";
import {
  civilPublicationsQuery,
  publishItaPublication,
  reviseCivilPublication,
} from "@/lib/civil-publication-client";
import {
  CIVIL_PUBLICATION_MAX_AGE_HOURS,
  civilPublicationLifecycle,
  type CivilPublication,
} from "@/lib/civil-publication";
import { civilDefaultExpiry } from "@/lib/incident-lifecycle";

type Props = {
  reportId: string;
  incidentIndex: number;
  summary: string;
  publishedAt: string;
  publication?: CivilPublication | undefined;
  suggestion?: CivilDecision | undefined;
};

function localDate(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function CivilPublicationReview(props: Props) {
  const { t } = useTranslation("admin");
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      className="mt-3 rounded border border-border p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">
        {t(props.publication ? "publication.manage" : "publication.review")}
        {props.publication &&
          ` · ${t(`publication.${civilPublicationLifecycle(props.publication)}`)}`}
      </summary>
      {open && <PublicationForm {...props} onDone={() => setOpen(false)} />}
    </details>
  );
}

function PublicationForm({
  reportId,
  incidentIndex,
  summary: initialSummary,
  publishedAt,
  publication: initialPublication,
  suggestion,
  onDone,
}: Props & { onDone: () => void }) {
  const { t } = useTranslation("admin");
  const qc = useQueryClient();
  const units = useQuery(adminUnitsQuery);
  const [publication] = useState(initialPublication);
  const [summary, setSummary] = useState(
    publication?.summary ?? suggestion?.summary ?? initialSummary,
  );
  const [hazard, setHazard] = useState<CivilPublication["hazard"]>(
    publication?.hazard ?? suggestion?.hazard ?? "road",
  );
  const [areaId, setAreaId] = useState(
    publication?.area_id ?? suggestion?.area_id ?? "",
  );
  const maximum =
    Date.parse(publishedAt) + CIVIL_PUBLICATION_MAX_AGE_HOURS * 3_600_000;
  const [expires, setExpires] = useState(() =>
    localDate(
      publication?.expires_at ??
        civilDefaultExpiry(publishedAt, hazard, Date.now()),
    ),
  );
  const [reason, setReason] = useState("");
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const mutation = useMutation({
    mutationFn: async (action: "save" | "withdraw") => {
      if (!reason.trim()) throw new Error(t("publication.reasonRequired"));
      if (publication)
        return reviseCivilPublication({
          id: publication.id,
          expectedRevision: publication.revision,
          action: action === "withdraw" ? "withdraw" : "update",
          patch:
            action === "withdraw"
              ? undefined
              : {
                  summary,
                  hazard,
                  area_id: areaId,
                  expires_at: new Date(expires).toISOString(),
                },
          reason,
        });
      return publishItaPublication({
        reportId,
        incidentIndex,
        hazard,
        summary,
        areaId,
        expiresAt: new Date(expires).toISOString(),
        reason,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: civilPublicationsQuery(true).queryKey.slice(0, 1),
      });
      await qc.invalidateQueries({ queryKey: ["admin", "civil-attention"] });
      onDone();
    },
  });
  if (publication?.state === "withdrawn")
    return (
      <p className="mt-2 text-muted-foreground">
        {t("publication.withdrawnExplanation")}
      </p>
    );
  const field =
    "mt-1 w-full rounded border border-input bg-background px-3 py-2";
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate("save");
      }}
    >
      <p className="text-xs text-muted-foreground">{t("publication.policy")}</p>
      {!publication && (
        <p className="text-xs text-muted-foreground">
          {t("publication.agent.correction")}
        </p>
      )}
      {publication && (
        <a className="underline" href={`/?event=civil%3A${publication.id}`}>
          {t("publication.view")}
        </a>
      )}
      <label className="block">
        {t("publication.summary")}
        <textarea
          lang="fr"
          required
          maxLength={2000}
          className={field}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          {t("publication.hazard")}
          <select
            className={field}
            value={hazard}
            onChange={(event) =>
              setHazard(event.target.value as CivilPublication["hazard"])
            }
          >
            {(["fire", "weather", "flood", "road", "other"] as const).map(
              (value) => (
                <option key={value} value={value}>
                  {t(`publication.hazards.${value}`)}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          {t("publication.area")}
          <select
            required
            className={field}
            value={areaId}
            disabled={!units.data}
            onChange={(event) => setAreaId(event.target.value)}
          >
            <option value="">{t("publication.chooseArea")}</option>
            {units.data?.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.code} — {unit.name_fr} ({unit.level})
              </option>
            ))}
          </select>
        </label>
      </div>
      {units.isError && (
        <p role="alert" className="text-destructive">
          {units.error.message}
        </p>
      )}
      <label className="block">
        {t("publication.expires")}
        <input
          className={field}
          type="datetime-local"
          required
          max={localDate(new Date(maximum).toISOString())}
          value={expires}
          onChange={(event) => setExpires(event.target.value)}
        />
      </label>
      <label className="block">
        {t("publication.reason")}
        <textarea
          required
          maxLength={1000}
          className={field}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {mutation.isError && (
        <div role="alert" className="text-destructive">
          <p>{mutation.error.message}</p>
          <button
            type="button"
            className="underline"
            onClick={async () => {
              await qc.invalidateQueries({
                queryKey: civilPublicationsQuery(true).queryKey.slice(0, 1),
              });
              onDone();
            }}
          >
            {t("publication.refresh")}
          </button>
        </div>
      )}
      {mutation.isSuccess && <p role="status">{t("publication.saved")}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
          disabled={mutation.isPending || !units.data || maximum <= Date.now()}
          type="submit"
        >
          {t(publication ? "publication.save" : "publication.publish")}
        </button>
        {publication && (
          <button
            type="button"
            className="rounded border border-destructive px-3 py-2 text-destructive"
            disabled={mutation.isPending}
            onClick={() => setConfirmWithdrawal(true)}
          >
            {t("publication.withdraw")}
          </button>
        )}
      </div>
      {confirmWithdrawal && (
        <div className="rounded border border-destructive p-3">
          <p>{t("publication.withdrawConfirm")}</p>
          <button
            type="button"
            disabled={mutation.isPending || !reason.trim()}
            className="mt-2 rounded bg-destructive px-3 py-2 text-destructive-foreground disabled:opacity-50"
            onClick={() => mutation.mutate("withdraw")}
          >
            {t("publication.withdraw")}
          </button>
          <button
            type="button"
            className="ms-3 underline"
            onClick={() => setConfirmWithdrawal(false)}
          >
            {t("publication.cancel")}
          </button>
        </div>
      )}
      {maximum <= Date.now() && (
        <p className="text-muted-foreground">{t("publication.tooOld")}</p>
      )}
    </form>
  );
}
