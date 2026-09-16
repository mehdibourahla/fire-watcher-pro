import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bell,
  Bookmark,
  ChevronDown,
  Crosshair,
  Layers,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import type { FeatureCollection } from "geojson";
import { MapCanvas } from "@/components/MapCanvas";
import { DetailSheet } from "@/components/nadhir/DetailSheet";
import {
  SituationCard,
  SituationDetails,
  hazardIcons,
  useSituationLabels,
} from "@/components/nadhir/CivilSituation";
import { MapSurvivalPrompt } from "@/components/nadhir/MapSurvivalPrompt";
import { WeatherForecast } from "@/components/nadhir/WeatherForecast";
import { SubscribeSheet } from "@/components/nadhir/SubscribeSheet";
import { BroadcastBanner } from "@/components/nadhir/BroadcastBanner";
import { EmergencyNumbers } from "@/components/SiteChrome";
import {
  adminUnitsQuery,
  clustersQuery,
  officialIncidentsQuery,
  onmVigilanceQuery,
  sourceHealthQuery,
  unitName,
  relativeTime,
  type AdminUnit,
} from "@/lib/nadhir";
import { hazardReportsGeoJSON, hazardReportsQuery } from "@/lib/open-areas";
import {
  buildSituations,
  filterSituations,
  findPlaces,
  nearestPlace,
  CITIZEN_NEARBY_RADIUS_KM,
  type HazardCategory,
  type Situation,
} from "@/lib/civil-map";
import { parseMapSearch, type MapSearch } from "@/lib/civil-map-search";
import { readSubscription } from "@/lib/push";
import { pageMeta } from "@/lib/page-meta";
import type { Locale } from "@/i18n";

export const Route = createFileRoute("/")({
  head: () => ({ meta: pageMeta("map.metaTitle", "map.metaDescription") }),
  validateSearch: (search: SearchSchemaInput & Partial<MapSearch>) =>
    parseMapSearch(search),
  component: LiveMapPage,
});

const REFRESH = {
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
  refetchOnReconnect: true,
  retry: 1,
} as const;
const SAVED_KEY = "nadhir.map.saved-places";
const categories: HazardCategory[] = [
  "all",
  "fire",
  "weather",
  "road",
  "other",
];
const pointCollection = (items: Situation[]): FeatureCollection => ({
  type: "FeatureCollection",
  features: items.flatMap((item) =>
    item.lat === null || item.lon === null
      ? []
      : [
          {
            type: "Feature" as const,
            geometry: {
              type: "Point" as const,
              coordinates: [item.lon, item.lat],
            },
            properties: {
              id: item.id.split(":").slice(1).join(":"),
              status: item.source === "official" ? item.data.status : "unknown",
            },
          },
        ],
  ),
});

function LiveMapPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const update = (next: Partial<MapSearch>, replace = false) =>
    void navigate({
      search: (prev) => ({ ...prev, ...next }),
      replace,
      resetScroll: false,
    });
  const units = useQuery(adminUnitsQuery);
  const fires = useQuery({ ...clustersQuery, ...REFRESH });
  const official = useQuery({ ...officialIncidentsQuery, ...REFRESH });
  const reports = useQuery({ ...hazardReportsQuery, ...REFRESH });
  const warnings = useQuery({ ...onmVigilanceQuery, ...REFRESH });
  const health = useQuery({ ...sourceHealthQuery, ...REFRESH });
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [options, setOptions] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [offline, setOffline] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [subscribed, setSubscribed] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    const connection = () => setOffline(!navigator.onLine);
    connection();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(SAVED_KEY) ?? "[]",
      );
      if (Array.isArray(value))
        setSaved(
          value.filter((s): s is string => typeof s === "string").slice(0, 12),
        );
    } catch {
      setMessage("civilMap.savedUnavailable");
    }
    setSubscribed(readSubscription()?.communes ?? []);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, []);
  const allUnits = useMemo(() => units.data ?? [], [units.data]);
  const area = allUnits.find((u) => u.id === search.area) ?? null;
  const places = useMemo(
    () => findPlaces(allUnits, query, locale),
    [allUnits, query, locale],
  );
  const items = useMemo(
    () =>
      buildSituations({
        fires: fires.data ?? [],
        official: official.data ?? [],
        reports: reports.data ?? [],
        warnings: warnings.data ?? [],
        units: allUnits,
        now,
      }),
    [fires.data, official.data, reports.data, warnings.data, allUnits, now],
  );
  const visible = useMemo(
    () =>
      filterSituations(
        items,
        {
          category: search.hazard,
          area,
          showEnded: search.ended,
          showCandidates: search.candidates,
        },
        allUnits,
      ),
    [items, search.hazard, area, search.ended, search.candidates, allUnits],
  );
  const selected = visible.find((i) => i.id === search.event);
  const labels = useSituationLabels(allUnits, now);
  const mapFires = visible.flatMap((i) =>
    i.source === "satellite" && i.lat !== null && i.lon !== null
      ? [i.data]
      : [],
  );
  const mapOfficial = pointCollection(
    visible.filter((i) => i.source === "official"),
  );
  const mapWarnings = pointCollection(
    visible.filter((i) => i.source === "onm"),
  );
  const mapReports = hazardReportsGeoJSON(
    visible.flatMap((i) =>
      i.source === "citizen" && i.lat !== null && i.lon !== null
        ? [i.data]
        : [],
    ),
  );
  const queries = [fires, official, reports, warnings];
  const loading = queries.some((q) => q.isPending);
  const refreshing = queries.some((q) => q.isFetching) || health.isFetching;
  const relevantKeys = new Set([
    "firms",
    "fci",
    "fusion",
    "dgpc_telegram",
    "onm",
  ]);
  const limited =
    offline ||
    queries.some((q) => q.isError) ||
    health.isError ||
    health.isPending ||
    (health.data ?? []).some(
      (s) => relevantKeys.has(s.key) && s.state !== "healthy",
    );
  const checkedAt = Math.min(
    ...queries.map((q) => q.dataUpdatedAt).filter(Boolean),
  );
  const focus = useMemo(() => {
    if (selected && selected.lat !== null && selected.lon !== null)
      return {
        lat: selected.lat,
        lon: selected.lon,
        zoom:
          selected.source === "onm" ||
          (selected.source === "official" &&
            (selected.data.precision === "wilaya" || !selected.data.commune_id))
            ? 7
            : 10,
      };
    return area
      ? { lat: area.lat, lon: area.lon, zoom: area.level === "wilaya" ? 7 : 10 }
      : { lat: 35.8, lon: 2.6, zoom: 5.1 };
  }, [area, selected]);
  const following = !!area && subscribed.includes(area.code);
  const chooseArea = (unit: AdminUnit | null) => {
    setMessage("");
    update({ area: unit?.id, event: undefined });
    setQuery("");
    setSearchOpen(false);
    setForecastOpen(false);
  };
  const locate = () => {
    setMessage("");
    if (!navigator.geolocation) {
      setMessage("civilMap.locationDenied");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const unit = nearestPlace(
          allUnits,
          position.coords.latitude,
          position.coords.longitude,
        );
        if (unit) {
          chooseArea(unit);
          setMessage("civilMap.nearby");
        } else setMessage("civilMap.outsideCoverage");
      },
      () => {
        setLocating(false);
        setMessage("civilMap.locationDenied");
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  };
  const savePlace = () => {
    if (!area) return;
    const next = saved.includes(area.id)
      ? saved.filter((id) => id !== area.id)
      : [area.id, ...saved].slice(0, 12);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      setSaved(next);
    } catch {
      setMessage("civilMap.savedUnavailable");
    }
  };
  const select = (id: string) => {
    update({ event: id });
  };
  const refresh = () => {
    for (const q of [...queries, health]) void q.refetch();
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage("civilMap.copied");
    } catch {
      setMessage("civilMap.shareFailed");
    }
  };

  return (
    <div className="civil-map-page relative mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col gap-3 overflow-hidden p-3 lg:p-5">
      <div className="min-h-0 max-h-[50%] shrink-0 overflow-y-auto overscroll-contain pe-1">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
              {t("civilMap.title")}
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-lg font-semibold lg:text-2xl">
              <MapPin aria-hidden className="size-5 text-primary" />
              <span className="truncate">
                {area ? unitName(area, locale) : t("civilMap.national")}
              </span>
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="min-h-11 rounded-full border px-4 text-sm font-medium"
            >
              {t("civilMap.help")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (area?.level === "commune") setSubscriptionOpen(true);
                else {
                  setMessage("civilMap.communeOnly");
                  searchRef.current?.focus();
                  setSearchOpen(true);
                }
              }}
              className="flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              <Bell aria-hidden className="size-4" />
              <span className="sr-only sm:not-sr-only">
                {t(following ? "civilMap.following" : "civilMap.follow")}
              </span>
            </button>
          </div>
        </div>
        <div className="relative z-20 mb-3 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute start-4 top-3.5 size-5 text-muted-foreground"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearchOpen(false);
              }}
              aria-label={t("civilMap.search")}
              aria-expanded={searchOpen}
              aria-controls="map-place-results"
              placeholder={t("civilMap.search")}
              className="h-12 w-full rounded-2xl border border-border bg-surface pe-4 ps-12 text-base shadow-sm focus:outline-2 focus:outline-primary"
            />
            {searchOpen && (
              <div
                id="map-place-results"
                className="mt-2 rounded-2xl border bg-surface p-2 shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => chooseArea(null)}
                    className="min-h-11 px-3 text-sm font-semibold"
                  >
                    {t("civilMap.allAreas")}
                  </button>
                  <button
                    type="button"
                    aria-label={t("civilMap.close")}
                    onClick={() => setSearchOpen(false)}
                    className="flex size-11 items-center justify-center"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                {!query && saved.length > 0 && (
                  <>
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      {t("civilMap.savedPlaces")}
                    </p>
                    {allUnits
                      .filter((u) => saved.includes(u.id))
                      .map((u) => (
                        <button
                          type="button"
                          key={u.id}
                          onClick={() => chooseArea(u)}
                          className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-start text-sm hover:bg-muted"
                        >
                          <Bookmark className="size-4" />
                          {unitName(u, locale)}
                        </button>
                      ))}
                  </>
                )}
                {units.isPending ? (
                  <p className="p-3 text-sm">{t("civilMap.loading")}</p>
                ) : units.isError ? (
                  <p role="status" className="p-3 text-sm">
                    {t("civilMap.error")}
                  </p>
                ) : query && places.length === 0 ? (
                  <p className="p-3 text-sm">{t("civilMap.searchEmpty")}</p>
                ) : (
                  places.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => chooseArea(u)}
                      className="flex min-h-12 w-full items-center justify-between rounded-lg px-3 text-start text-sm hover:bg-muted"
                    >
                      <span>{unitName(u, locale)}</span>
                      <span className="text-xs text-muted-foreground">
                        {u.code}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={locate}
            disabled={locating || !allUnits.length}
            aria-label={t("civilMap.locate")}
            title={t("civilMap.locate")}
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-surface disabled:opacity-50"
          >
            {locating ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <Crosshair className="size-5" />
            )}
          </button>
          {area && (
            <button
              type="button"
              onClick={savePlace}
              aria-label={t(
                saved.includes(area.id)
                  ? "civilMap.unsavePlace"
                  : "civilMap.savePlace",
              )}
              aria-pressed={saved.includes(area.id)}
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-surface"
            >
              <Bookmark
                className={`size-5 ${saved.includes(area.id) ? "fill-primary text-primary" : ""}`}
              />
            </button>
          )}
        </div>
        {message && (
          <p
            role="status"
            className="mb-3 flex items-center justify-between rounded-xl bg-muted px-3 text-sm"
          >
            {t(message)}
            <button
              type="button"
              onClick={() => setMessage("")}
              aria-label={t("civilMap.close")}
              className="flex size-11 shrink-0 items-center justify-center"
            >
              <X className="size-4" />
            </button>
          </p>
        )}
        <div
          className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${limited ? "border-amber-500/25 bg-amber-500/10" : "border-border bg-surface"}`}
          role="status"
        >
          <span className="flex items-center gap-2">
            {limited ? (
              <TriangleAlert
                aria-hidden
                className="size-4 shrink-0 text-amber-700"
              />
            ) : (
              <ShieldCheck
                aria-hidden
                className="size-4 shrink-0 text-primary"
              />
            )}
            <span>
              {t(
                offline
                  ? "civilMap.offline"
                  : limited
                    ? "civilMap.limited"
                    : "civilMap.sourceTime",
              )}{" "}
              {Number.isFinite(checkedAt) && (
                <span className="text-muted-foreground">
                  ·{" "}
                  {t("civilMap.updated", {
                    time: relativeTime(
                      new Date(checkedAt).toISOString(),
                      locale,
                      now,
                    ),
                  })}
                </span>
              )}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <Link
              to="/status"
              className="inline-flex min-h-9 items-center underline underline-offset-2"
            >
              {t("civilMap.coverage")}
            </Link>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              aria-label={t("civilMap.refresh")}
              className="flex size-11 items-center justify-center rounded-full hover:bg-muted"
            >
              <RefreshCw
                className={`size-4 ${refreshing ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
        <div
          className="mb-3 flex items-center gap-2 overflow-x-auto pb-1"
          aria-label={t("civilMap.filters")}
        >
          {categories.map((category) => {
            const Icon = hazardIcons[category];
            return (
              <button
                type="button"
                key={category}
                aria-pressed={search.hazard === category}
                onClick={() => update({ hazard: category, event: undefined })}
                className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium ${search.hazard === category ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:bg-muted"}`}
              >
                <Icon aria-hidden className="size-4" />
                {t(`civilMap.${category}`)}
              </button>
            );
          })}
          <button
            type="button"
            aria-expanded={options}
            onClick={() => setOptions(!options)}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border bg-surface px-4 text-sm"
          >
            <Layers className="size-4" />
            {t("civilMap.filters")}
          </button>
        </div>
        {options && (
          <div className="mb-3 flex flex-wrap gap-x-5 rounded-xl border bg-surface px-4 py-2 text-sm">
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={search.candidates}
                onChange={(e) =>
                  update({ candidates: e.target.checked, event: undefined })
                }
              />
              {t("civilMap.showCandidates")}
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={search.ended}
                onChange={(e) =>
                  update({ ended: e.target.checked, event: undefined })
                }
              />
              {t("civilMap.showEnded")}
            </label>
            <p className="w-full pb-2 text-xs text-muted-foreground">
              {t("civilMap.satelliteLegend")} · {t("civilMap.officialLegend")} ·{" "}
              {t("civilMap.weatherLegend")} · {t("civilMap.citizenLegend")}
            </p>
          </div>
        )}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:gap-4">
        <section
          aria-label={t("civilMap.mapTitle")}
          className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border bg-muted lg:order-2"
        >
          <MapCanvas
            clusters={mapFires}
            official={mapOfficial}
            warnings={mapWarnings}
            reports={mapReports}
            focus={focus}
            layers={{
              fires: true,
              official: true,
              reports: true,
              industrialSources: false,
              unverified: search.candidates,
            }}
            selectedShortId={
              selected?.source === "satellite" ? selected.data.short_id : null
            }
            selectedOfficialId={
              selected?.source === "official" ? selected.data.id : null
            }
            onSelect={(c) => select(`fire:${c.id}`)}
            onSelectOfficial={(id) => select(`official:${id}`)}
            onSelectReport={(id) => select(`report:${id}`)}
            onSelectWarning={(id) => select(`weather:${id}`)}
            onError={() => setMapFailed(true)}
            onReady={() => setMapFailed(false)}
          />
          {mapFailed && (
            <p
              role="status"
              className="absolute inset-x-3 top-3 rounded-xl bg-surface p-3 text-sm shadow"
            >
              {t("civilMap.mapUnavailable")}
            </p>
          )}
          <DetailSheet
            open={!!search.event}
            title={
              selected
                ? labels.title(selected)
                : t("civilMap.detailUnavailable")
            }
            onClose={() => update({ event: undefined }, true)}
          >
            {selected ? (
              <>
                <SituationDetails item={selected} units={allUnits} now={now} />
                <button
                  type="button"
                  onClick={() => void share()}
                  className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-medium"
                >
                  <Share2 className="size-4" />
                  {t("civilMap.share")}
                </button>
              </>
            ) : (
              <p>
                {t(loading ? "civilMap.loading" : "civilMap.detailUnavailable")}
              </p>
            )}
          </DetailSheet>
        </section>
        <section
          aria-label={t("civilMap.list")}
          className={`absolute inset-x-0 bottom-0 z-10 flex min-h-0 flex-col overflow-hidden rounded-t-3xl border border-border bg-surface px-4 pb-3 shadow-sm lg:static lg:order-1 lg:h-full lg:w-[370px] lg:shrink-0 lg:rounded-2xl lg:pt-4 ${expanded ? "h-[75%]" : ""}`}
        >
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="mx-auto flex h-11 w-full shrink-0 items-center justify-center lg:hidden"
            aria-label={t(expanded ? "civilMap.collapse" : "civilMap.expand")}
          >
            <span className="h-1 w-10 rounded-full bg-border" />
          </button>
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <h2 className="text-sm font-semibold">
              {t("civilMap.situations", { count: visible.length })}
            </h2>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {t(`civilMap.${search.hazard}`)}
            </span>
          </div>
          <div
            className={`${expanded ? "" : "hidden"} min-h-0 flex-1 overflow-y-auto overscroll-contain pe-1 lg:block`}
          >
            {area && (
              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                {t("civilMap.nearbyScope", { km: CITIZEN_NEARBY_RADIUS_KM })}
              </p>
            )}
            {loading && (
              <p
                role="status"
                className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"
              >
                <LoaderCircle className="size-4 animate-spin" />
                {t("civilMap.loading")}
              </p>
            )}
            {!loading && !visible.length && (
              <div className="rounded-2xl bg-muted/50 px-4 py-8 text-center">
                <ShieldCheck
                  aria-hidden
                  className="mx-auto mb-3 size-7 text-muted-foreground"
                />
                <h3 className="text-base font-medium">
                  {t(
                    queries.every((q) => q.isError)
                      ? "civilMap.error"
                      : "civilMap.noSituations",
                  )}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t("civilMap.noSituationsBody")}
                </p>
              </div>
            )}
            <div className="space-y-3">
              {visible.map((item) => (
                <SituationCard
                  key={item.id}
                  item={item}
                  units={allUnits}
                  now={now}
                  selected={item.id === search.event}
                  onSelect={() => select(item.id)}
                />
              ))}
            </div>
            <div className="mt-4 border-t pt-4">
              <button
                type="button"
                onClick={() => {
                  if (area?.level === "commune") setForecastOpen(true);
                  else {
                    setMessage("civilMap.selectCommuneWeather");
                    searchRef.current?.focus();
                    setSearchOpen(true);
                  }
                }}
                className="flex min-h-11 w-full items-center justify-between rounded-xl bg-muted px-3 text-sm font-medium"
              >
                {t("civilMap.forecast")}
                <ChevronDown className="size-4" />
              </button>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t("civilMap.forecastsNotWarnings")}
              </p>
            </div>
            <div className="mt-4">
              <BroadcastBanner />
            </div>
          </div>
        </section>
      </div>
      {forecastOpen && area?.level === "commune" && (
        <DetailSheet
          open
          title={`${t("civilMap.forecast")} · ${unitName(area, locale)}`}
          onClose={() => setForecastOpen(false)}
        >
          <WeatherForecast communeId={area.id} />
        </DetailSheet>
      )}
      {helpOpen && (
        <DetailSheet
          open
          title={t("civilMap.help")}
          onClose={() => setHelpOpen(false)}
        >
          <EmergencyNumbers />
          <Link
            to="/survival"
            className="mt-4 flex min-h-11 items-center justify-center rounded-xl border border-red-500 px-4 text-sm font-semibold text-red-700"
          >
            {t("civilMap.fireHelp")}
          </Link>
        </DetailSheet>
      )}
      {subscriptionOpen && area?.level === "commune" && (
        <SubscribeSheet
          key={area.code}
          open
          initialCommuneCode={area.code}
          onClose={() => {
            setSubscriptionOpen(false);
            setSubscribed(readSubscription()?.communes ?? []);
          }}
        />
      )}
      <MapSurvivalPrompt fires={fires.data ?? []} now={now} />
    </div>
  );
}
