import * as maplibregl from "maplibre-gl";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Point } from "geojson";
import { fireStage, type FireCluster } from "@/lib/nadhir";
import { DEFAULT_MAP_LAYERS, type MapLayers } from "./map-layers";
import { visibleMapFires } from "./map-fire-filter";
import {
  drawBadge,
  pointSymbolLayer,
  prepareSymbols,
  SYMBOLS,
} from "./map-symbols";
export type { MapLayers } from "./map-layers";
export type MapPadding = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};
type Props = {
  clusters: FireCluster[];
  selectedShortId?: string | null;
  onSelect?: (cluster: FireCluster) => void;
  official?: FeatureCollection;
  selectedOfficialId?: string | null;
  onSelectOfficial?: (id: string) => void;
  reports?: FeatureCollection;
  selectedReportId?: string | null;
  onSelectReport?: (id: string) => void;
  warnings?: FeatureCollection;
  selectedWarningId?: string | null;
  onSelectWarning?: (id: string) => void;
  focus?: { lat: number; lon: number; zoom: number };
  padding?: MapPadding;
  onError?: () => void;
  onReady?: () => void;
  center?: [number, number];
  zoom?: number;
  interactive?: boolean;
  layers?: MapLayers;
};
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const POINT_LAYERS = [
  "fires-selected",
  "official-selected",
  "reports-selected",
  "warnings-selected",
  "fires-points",
  "fires-groups",
  "official-groups",
  "reports-groups",
  "warnings-groups",
  "official-points",
  "reports-points",
  "warnings-points",
];
const AREA_LAYERS = ["official-fill", "warnings-fill"];
const ZERO_PADDING: MapPadding = { top: 0, bottom: 0, left: 0, right: 0 };
function currentStyle() {
  return document.documentElement.classList.contains("dark")
    ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
    : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
}
function fireFeatures(
  clusters: FireCluster[],
  selectedShortId?: string | null,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: clusters.map((fire) => {
      const selected = fire.short_id === selectedShortId;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [fire.lon, fire.lat] },
        properties: {
          id: fire.short_id,
          label: fire.short_id,
          selected,
          icon: `fire${selected ? "-selected" : ""}`,
          candidate: fireStage(fire) === "candidate",
          ended:
            fire.state === "extinguished" || fire.state === "false_positive",
        },
      };
    }),
  };
}
function installLayers(map: maplibregl.Map) {
  for (const symbol of SYMBOLS)
    for (const selected of [false, true]) {
      const id = `${symbol}${selected ? "-selected" : ""}`;
      if (!map.hasImage(id))
        map.addImage(id, drawBadge(symbol, selected), { pixelRatio: 2 });
    }
  for (const source of ["official", "warnings", "reports", "fires"]) {
    if (!map.getSource(`${source}-selection`))
      map.addSource(`${source}-selection`, { type: "geojson", data: EMPTY });
    if (!map.getSource(source))
      map.addSource(source, {
        type: "geojson",
        data: EMPTY,
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 7,
      });
  }
  for (const source of ["official", "warnings"]) {
    if (!map.getSource(`${source}-areas`))
      map.addSource(`${source}-areas`, { type: "geojson", data: EMPTY });
    if (map.getLayer(`${source}-fill`)) continue;
    const color = source === "official" ? "#a84422" : "#326eaa";
    map.addLayer({
      id: `${source}-fill`,
      source: `${source}-areas`,
      type: "fill",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": color,
        "fill-opacity": [
          "case",
          ["boolean", ["get", "selected"], false],
          0.12,
          0.04,
        ],
      },
    });
    map.addLayer({
      id: `${source}-outline`,
      source: `${source}-areas`,
      type: "line",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": color,
        "line-opacity": 0.65,
        "line-width": ["case", ["boolean", ["get", "selected"], false], 2.5, 1],
        "line-dasharray": [3, 2],
      },
    });
  }
  for (const source of ["official", "warnings", "reports", "fires"]) {
    if (map.getLayer(`${source}-groups`)) continue;
    map.addLayer({
      id: `${source}-groups`,
      source,
      type: "symbol",
      filter: ["has", "point_count"],
      layout: {
        "icon-image": "group",
        "icon-size": 1,
        "icon-allow-overlap": true,
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Open Sans Semibold"],
        "text-size": 12,
        "text-allow-overlap": true,
      },
      paint: { "text-color": "#ffffff" },
    });
  }
  for (const source of ["official", "warnings", "reports", "fires"]) {
    if (map.getLayer(`${source}-points`)) continue;
    const layer = pointSymbolLayer(`${source}-points`, source);
    if (source === "fires")
      layer.paint = {
        ...layer.paint,
        "icon-opacity": [
          "case",
          ["boolean", ["get", "selected"], false],
          1,
          ["boolean", ["get", "ended"], false],
          0.45,
          ["boolean", ["get", "candidate"], false],
          0.7,
          1,
        ],
      };
    map.addLayer(layer);
  }
  for (const source of ["official", "warnings", "reports", "fires"]) {
    if (!map.getLayer(`${source}-selected`))
      map.addLayer(
        pointSymbolLayer(`${source}-selected`, `${source}-selection`, true),
      );
  }
}
export default function FireMap({
  clusters,
  selectedShortId,
  onSelect,
  official = EMPTY,
  selectedOfficialId,
  onSelectOfficial,
  reports = EMPTY,
  selectedReportId,
  onSelectReport,
  warnings = EMPTY,
  selectedWarningId,
  onSelectWarning,
  focus,
  padding = ZERO_PADDING,
  onError,
  onReady,
  center = [3.6, 35.8],
  zoom = 5.1,
  interactive = true,
  layers = DEFAULT_MAP_LAYERS,
}: Props) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const visibleClusters = useMemo(
    () => visibleMapFires(clusters, layers.unverified),
    [clusters, layers.unverified],
  );
  const data = useMemo(
    () => ({
      fires: fireFeatures(visibleClusters, selectedShortId),
      official: prepareSymbols(official, "official", selectedOfficialId),
      reports: prepareSymbols(reports, "reports", selectedReportId),
      warnings: prepareSymbols(warnings, "warnings", selectedWarningId),
    }),
    [
      visibleClusters,
      selectedShortId,
      official,
      selectedOfficialId,
      reports,
      selectedReportId,
      warnings,
      selectedWarningId,
    ],
  );
  const latest = useRef({
    data,
    layers,
    visibleClusters,
    onSelect,
    onSelectOfficial,
    onSelectReport,
    onSelectWarning,
    onError,
    onReady,
    padding,
    focus,
  });
  useLayoutEffect(() => {
    latest.current = {
      data,
      layers,
      visibleClusters,
      onSelect,
      onSelectOfficial,
      onSelectReport,
      onSelectWarning,
      onError,
      onReady,
      padding,
      focus,
    };
  });
  const initRef = useRef({ center, zoom, interactive });
  const syncRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!containerRef.current) return;
    let ready = false;
    let disposed = false;
    const fail = () => {
      setFailed(true);
      latest.current.onError?.();
    };
    let map: maplibregl.Map;
    try {
      const initial = initRef.current;
      const target = latest.current.focus;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: currentStyle(),
        center: target ? [target.lon, target.lat] : initial.center,
        zoom: target?.zoom ?? initial.zoom,
        minZoom: 3.5,
        interactive: initial.interactive,
        attributionControl: { compact: true },
      });
    } catch {
      fail();
      return;
    }
    mapRef.current = map;
    if (initRef.current.interactive)
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "bottom-left",
      );
    const sync = () => {
      if (!ready) return;
      const current = latest.current;
      for (const source of [
        "fires",
        "official",
        "reports",
        "warnings",
      ] as const) {
        (
          map.getSource(source) as maplibregl.GeoJSONSource | undefined
        )?.setData({
          ...current.data[source],
          features: current.data[source].features.filter(
            (feature) =>
              feature.geometry.type === "Point" &&
              feature.properties?.["selected"] !== true,
          ),
        });
        (
          map.getSource(`${source}-selection`) as
            maplibregl.GeoJSONSource | undefined
        )?.setData({
          ...current.data[source],
          features: current.data[source].features.filter(
            (feature) =>
              feature.geometry.type === "Point" &&
              feature.properties?.["selected"] === true,
          ),
        });
        (
          map.getSource(`${source}-areas`) as
            maplibregl.GeoJSONSource | undefined
        )?.setData({
          ...current.data[source],
          features: current.data[source].features.filter(
            (feature) =>
              feature.geometry.type === "Polygon" ||
              feature.geometry.type === "MultiPolygon",
          ),
        });
        const visible = source === "warnings" || current.layers[source];
        for (const suffix of [
          "points",
          "selected",
          "groups",
          "fill",
          "outline",
        ]) {
          const id = `${source}-${suffix}`;
          if (map.getLayer(id))
            map.setLayoutProperty(
              id,
              "visibility",
              visible ? "visible" : "none",
            );
        }
      }
    };
    syncRef.current = sync;
    const timeout = window.setTimeout(() => {
      if (!ready) fail();
    }, 20000);
    map.on("error", (event) => {
      if (event.error?.message?.includes("WebGL")) fail();
    });
    map.on("style.load", () => {
      try {
        installLayers(map);
      } catch {
        fail();
        return;
      }
      ready = true;
      sync();
      window.clearTimeout(timeout);
      setFailed(false);
      setLoaded(true);
      latest.current.onReady?.();
    });
    const featuresAt = (point: maplibregl.Point) => {
      const points = map.queryRenderedFeatures(point, {
        layers: POINT_LAYERS.filter((id) => map.getLayer(id)),
      });
      return points.length
        ? points
        : map.queryRenderedFeatures(point, {
            layers: AREA_LAYERS.filter((id) => map.getLayer(id)),
          });
    };
    map.on("click", (event) => {
      if (!ready) return;
      const feature = featuresAt(event.point)[0];
      if (!feature) return;
      if (feature.properties["cluster_id"] !== undefined) {
        const source = map.getSource(
          feature.source,
        ) as maplibregl.GeoJSONSource;
        void source
          .getClusterExpansionZoom(feature.properties["cluster_id"])
          .then((nextZoom) => {
            if (!disposed)
              map.easeTo({
                center: (feature.geometry as Point).coordinates as [
                  number,
                  number,
                ],
                zoom: nextZoom,
                padding: latest.current.padding,
              });
          })
          .catch((error: unknown) => {
            if (!disposed && ready)
              console.error("Map cluster expansion failed", error);
          });
        return;
      }
      const id = feature.properties["id"];
      if (typeof id !== "string") return;
      const current = latest.current;
      const source = feature.source.replace(/-(areas|selection)$/, "");
      if (source === "fires") {
        const fire = current.visibleClusters.find(
          (item) => item.short_id === id,
        );
        if (fire) current.onSelect?.(fire);
      } else if (source === "official") current.onSelectOfficial?.(id);
      else if (source === "reports") current.onSelectReport?.(id);
      else if (source === "warnings") current.onSelectWarning?.(id);
    });
    map.on("mousemove", (event) => {
      map.getCanvas().style.cursor =
        ready && featuresAt(event.point).length ? "pointer" : "";
    });
    let style = currentStyle();
    const observer = new MutationObserver(() => {
      const next = currentStyle();
      if (next === style) return;
      style = next;
      ready = false;
      map.setStyle(next);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(containerRef.current);
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      observer.disconnect();
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      syncRef.current = () => {};
    };
  }, []);
  useEffect(() => {
    syncRef.current();
  }, [data, layers]);
  const { top, bottom, left, right } = padding;
  useEffect(() => {
    mapRef.current?.setPadding({ top, bottom, left, right });
  }, [top, bottom, left, right]);
  const focusLat = focus?.lat;
  const focusLon = focus?.lon;
  const focusZoom = focus?.zoom;
  useEffect(() => {
    if (
      focusLat !== undefined &&
      focusLon !== undefined &&
      focusZoom !== undefined
    )
      mapRef.current?.easeTo({
        center: [focusLon, focusLat],
        zoom: focusZoom,
        padding: latest.current.padding,
      });
  }, [focusLat, focusLon, focusZoom, top, bottom, left, right]);
  useEffect(() => {
    const map = mapRef.current;
    const target = latest.current.visibleClusters.find(
      (fire) => fire.short_id === selectedShortId,
    );
    if (map && target)
      map.easeTo({
        center: [target.lon, target.lat],
        zoom: Math.max(map.getZoom(), 8),
        padding: latest.current.padding,
      });
  }, [selectedShortId, top, bottom, left, right]);
  return (
    <div
      className="relative h-full w-full"
      role="region"
      aria-label={t("nav.map")}
    >
      <div ref={containerRef} className="civil-map h-full w-full" />
      {(!loaded || failed) && (
        <p
          role="status"
          className="absolute inset-x-3 top-3 rounded-xl bg-surface p-3 text-sm"
        >
          {t(failed ? "common.error" : "common.loading")}
        </p>
      )}
      <style>{`.civil-map .maplibregl-ctrl-group button { width: 44px; height: 44px; }
      .civil-map-page .maplibregl-ctrl-bottom-left { top: 220px; bottom: auto; left: auto; right: 12px; }
      .civil-map-page .maplibregl-ctrl-bottom-left .maplibregl-ctrl { margin: 0; }
      [dir="rtl"] .civil-map-page .maplibregl-ctrl-bottom-left { right: auto; left: 12px; }
      @media (max-height: 500px) and (max-width: 1023px) {
        .civil-map-page .civil-map-controls { flex-direction: row; }
        .civil-map-page .maplibregl-ctrl-bottom-left { top: 64px; }
      }`}</style>
    </div>
  );
}
