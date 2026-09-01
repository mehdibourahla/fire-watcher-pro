import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Locale } from "@/i18n";
import {
  adminUnitsQuery,
  relativeTime,
  unitName,
  wilayaGroups,
} from "@/lib/nadhir";
import { ReportPhoto } from "@/components/ReportPhoto";
import {
  createReport,
  createReportPhotoDraft,
  deleteReport,
  myReportsQuery,
  myRolesQuery,
  type CitizenReport,
  type ReportKind,
  ReportMutationError,
  type ReportPhotoDraft,
  type Sighting,
  type SizeHint,
} from "@/lib/reports";

type ReportSearch = { kind?: "sighting" | "smoke" | ReportKind };

export const Route = createFileRoute("/_authenticated/report")({
  validateSearch: (search: Record<string, unknown>): ReportSearch => {
    const kind = search["kind"];
    return kind === "sighting" ||
      kind === "smoke" ||
      kind === "road_blocked" ||
      kind === "person_trapped"
      ? { kind }
      : {};
  },
  head: () => ({
    meta: [
      { title: "Report a wildfire — Nadhir" },
      {
        name: "description",
        content:
          "Send a geolocated fire sighting to Nadhir moderators and help confirm satellite detections across Algeria.",
      },
      { property: "og:title", content: "Report a wildfire — Nadhir" },
      {
        property: "og:description",
        content: "Help confirm satellite detections with a ground report.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportPage,
});

const SIGHTINGS: Sighting[] = ["smoke", "flames", "smell", "other"];
const SIZES: SizeHint[] = ["small", "medium", "large"];

function ReportPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const search = Route.useSearch();
  const hazardKind: ReportKind =
    search.kind === "road_blocked" || search.kind === "person_trapped"
      ? search.kind
      : "sighting";
  const qc = useQueryClient();
  const units = useQuery(adminUnitsQuery);
  const mine = useQuery(myReportsQuery);
  const roles = useQuery(myRolesQuery);
  const isModerator = (roles.data ?? []).some(
    (r) => r === "moderator" || r === "admin",
  );

  const [lat, setLat] = useState("36.60");
  const [lon, setLon] = useState("4.05");
  const [communeId, setCommuneId] = useState("");
  const [sighting, setSighting] = useState<Sighting>(() =>
    search.kind === "sighting"
      ? "flames"
      : search.kind === "smoke"
        ? "smoke"
        : hazardKind !== "sighting"
          ? "other"
          : "smoke",
  );
  const [size, setSize] = useState<SizeHint>("small");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<ReportPhotoDraft | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(false);
  const [done, setDone] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["reports"] });

  useEffect(() => () => photo?.dispose(), [photo]);

  const submit = useMutation({
    mutationFn: () =>
      createReport(
        {
          kind: hazardKind,
          lat: Number(lat),
          lon: Number(lon),
          sighting,
          size_hint: size,
          note: note.trim() || null,
          commune_id: communeId || null,
          observed_at: new Date().toISOString(),
        },
        photo,
      ),
    onSuccess: () => {
      setDone(true);
      setNote("");
      setPhoto(null);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: deleteReport,
    onSuccess: invalidate,
  });

  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation)
      return setGeoError(true);
    setLocating(true);
    setGeoError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(4));
        setLon(pos.coords.longitude.toFixed(4));
        setLocating(false);
      },
      () => {
        setGeoError(true);
        setLocating(false);
      },
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="font-display text-2xl font-semibold">
        {t("reports.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("reports.subtitle")}
      </p>
      <p className="mt-3 rounded-md border border-border bg-secondary/40 p-3 text-sm">
        {t("reports.safety")}
      </p>
      {isModerator ? (
        <Link
          to="/moderation"
          className="mt-3 inline-block text-sm font-medium text-primary"
        >
          {t("nav.moderation")}
        </Link>
      ) : null}

      <form
        className="mt-6 space-y-5 rounded-lg border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setDone(false);
          submit.mutate();
        }}
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            {t("reports.location")}
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              {t("reports.lat")}
              <input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                required
                inputMode="decimal"
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              {t("reports.lon")}
              <input
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                required
                inputMode="decimal"
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              {t("reports.commune")}
              <select
                value={communeId}
                onChange={(e) => setCommuneId(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              >
                <option value="">{t("reports.communeNone")}</option>
                {wilayaGroups(units.data ?? []).map(
                  ({ wilaya, communes: cs }) => (
                    <optgroup key={wilaya.id} label={unitName(wilaya, locale)}>
                      {cs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {unitName(c, locale)}
                        </option>
                      ))}
                    </optgroup>
                  ),
                )}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={locate}
            className="rounded-md border border-border px-3 py-1.5 text-sm"
          >
            {locating ? t("reports.locating") : t("reports.useMyLocation")}
          </button>
          {geoError ? (
            <p className="text-xs text-destructive">
              {t("reports.locationError")}
            </p>
          ) : null}
        </fieldset>

        {hazardKind !== "sighting" ? (
          <p
            className="rounded-md px-3 py-2 text-sm font-medium"
            style={{
              backgroundColor: "var(--emergency-surface)",
              color: "var(--emergency)",
            }}
          >
            {t(
              hazardKind === "road_blocked"
                ? "survival.reportRoadBlocked"
                : "survival.reportPersonTrapped",
            )}
          </p>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            {t("reports.sighting")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {SIGHTINGS.map((s) => (
              <Chip
                key={s}
                active={sighting === s}
                onClick={() => setSighting(s)}
              >
                {t(`reports.sighting${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("reports.size")}</legend>
          <div className="flex flex-wrap gap-2">
            {SIZES.map((s) => (
              <Chip key={s} active={size === s} onClick={() => setSize(s)}>
                {t(`reports.size${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
              </Chip>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm font-medium">
          {t("reports.note")}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={t("reports.notePlaceholder")}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-normal text-foreground"
          />
        </label>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            {t("reports.photo")}
            <input
              type="file"
              accept="image/jpeg,image/png"
              capture="environment"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setPhotoError(null);
                try {
                  setPhoto(createReportPhotoDraft(file));
                } catch (error) {
                  const code = error instanceof Error ? error.message : "";
                  setPhotoError(
                    code === "too_large"
                      ? t("reports.photoTooLarge")
                      : code === "unsupported_type"
                        ? t("reports.photoBadType")
                        : t("reports.photoFailed"),
                  );
                }
              }}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-normal text-foreground"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {t("reports.photoHint")}
          </p>
          {submit.isPending && photo ? (
            <p className="text-xs text-muted-foreground">
              {t("reports.photoUploading")}
            </p>
          ) : null}
          {photoError ? (
            <p className="text-xs text-destructive">{photoError}</p>
          ) : null}
          {photo ? (
            <div className="flex items-start gap-3">
              <a href={photo.previewUrl} target="_blank" rel="noreferrer">
                <img
                  src={photo.previewUrl}
                  alt={t("reports.photoAlt")}
                  className="mt-2 h-28 w-40 rounded-md border border-border object-cover"
                />
              </a>
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="mt-2 rounded-md border border-border px-2 py-1 text-xs"
              >
                {t("reports.photoRemove")}
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submit.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {submit.isPending ? t("reports.submitting") : t("reports.submit")}
          </button>
          {done ? (
            <span className="text-sm text-muted-foreground">
              {t("reports.submitted")}
            </span>
          ) : null}
          {submit.isError ? (
            <span className="text-sm text-destructive">
              {t(
                submit.error instanceof ReportMutationError
                  ? submit.error.message
                  : "reports.submitFailed",
              )}
            </span>
          ) : null}
        </div>
      </form>

      <h2 className="mt-10 font-display text-lg font-semibold">
        {t("reports.mine")}
      </h2>
      {remove.isError ? (
        <p className="mt-3 text-sm text-destructive">
          {t(
            remove.error instanceof ReportMutationError
              ? remove.error.message
              : "reports.deleteFailed",
          )}
        </p>
      ) : null}
      {mine.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : (mine.data ?? []).length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("reports.empty")}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {(mine.data ?? []).map((r) => (
            <ReportRow
              key={r.id}
              report={r}
              locale={locale}
              onDelete={() => remove.mutate(r.id)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          : "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground"
      }
    >
      {children}
    </button>
  );
}

export function ReportRow({
  report,
  locale,
  onDelete,
}: {
  report: CitizenReport;
  locale: Locale;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const statusKey =
    report.status === "approved"
      ? "reports.statusApproved"
      : report.status === "rejected"
        ? "reports.statusRejected"
        : "reports.statusPending";
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {report.kind !== "sighting" ? (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: "var(--emergency-surface)",
              color: "var(--emergency)",
            }}
          >
            {t(
              report.kind === "road_blocked"
                ? "survival.reportRoadBlocked"
                : "survival.reportPersonTrapped",
            )}
          </span>
        ) : null}
        <span className="font-medium">
          {t(
            `reports.sighting${report.sighting.charAt(0).toUpperCase()}${report.sighting.slice(1)}`,
          )}{" "}
          ·{" "}
          {t(
            `reports.size${report.size_hint.charAt(0).toUpperCase()}${report.size_hint.slice(1)}`,
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {relativeTime(report.observed_at, locale)}
        </span>
        <span className="ms-auto rounded-full border border-border px-2 py-0.5 text-xs">
          {t(statusKey)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {report.lat.toFixed(3)}, {report.lon.toFixed(3)}
      </p>
      {report.note ? <p className="mt-2 text-sm">{report.note}</p> : null}
      {report.moderation_note ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {report.moderation_note}
        </p>
      ) : null}
      <ReportPhoto photo={report.photo_url} />
      <div className="mt-2 flex gap-3 text-xs">
        {report.status === "approved" && report.cluster_id ? (
          <Link to="/" className="text-primary">
            {t("reports.linkedFire")}
          </Link>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            {t("reports.delete")}
          </button>
        ) : null}
      </div>
    </li>
  );
}
