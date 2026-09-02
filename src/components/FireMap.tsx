import * as maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

import type { FeatureCollection, Point } from "geojson";

import type { FireCluster } from "@/lib/nadhir";

import { DEFAULT_MAP_LAYERS, type MapLayers } from "./map-layers";

export type { MapLayers } from "./map-layers";

type Props = {
  clusters: FireCluster[];
  selectedShortId?: string | null;
  onSelect?: (cluster: FireCluster) => void;
  official?: FeatureCollection;
  selectedOfficialId?: string | null;
  onSelectOfficial?: (id: string) => void;
  reports?: FeatureCollection;
  onSelectReport?: (id: string) => void;
  center?: [number, number];
  zoom?: number;
  interactive?: boolean;
  layers?: MapLayers;
};

const SRC = "fires";
const OFFICIAL_SRC = "official";
const REPORTS_SRC = "reports";
const OFFICIAL_LAYERS = [
  "official-fill",
  "official-outline",
  "official-points",
];
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const UNVERIFIED_MAX_CONFIDENCE = 0.6;

const BASEMAP = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
} as const;

// the app theme is driven only by the .dark class, so the basemap must not
// consult prefers-color-scheme or it desyncs from the chrome
function isDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

function token(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

function stateColor(state: string): string {
  if (state === "active") return token("--risk-4", "#d40924");
  if (state === "unconfirmed") return token("--risk-2", "#e4af00");
  if (state === "contained_guess") return token("--risk-3", "#f16a00");
  return token("--ink-faint", "#8c9094");
}

function toGeoJSON(clusters: FireCluster[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: clusters.map((c) => {
      const area = c.est_area_ha ?? 0;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [c.lon, c.lat] },
        properties: {
          short_id: c.short_id,
          state: c.state,
          color: stateColor(c.state),
          area,
          sizeRank: area > 300 ? 3 : area > 100 ? 2 : 1,
          unverified: c.confidence < UNVERIFIED_MAX_CONFIDENCE,
        },
      };
    }),
  };
}

function officialColor(): maplibregl.ExpressionSpecification {
  return [
    "match",
    ["get", "status"],
    "ongoing",
    token("--risk-3", "#f16a00"),
    "extinguished",
    token("--ink-faint", "#8c9094"),
    token("--risk-2", "#e4af00"),
  ];
}

// area-level by design: an official report names a commune, never a coordinate
function addOfficialLayers(map: maplibregl.Map, data: FeatureCollection) {
  if (map.getSource(OFFICIAL_SRC)) return;
  map.addSource(OFFICIAL_SRC, { type: "geojson", data });
  map.addLayer({
    id: "official-fill",
    type: "fill",
    source: OFFICIAL_SRC,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": officialColor(), "fill-opacity": 0.22 },
  });
  map.addLayer({
    id: "official-outline",
    type: "line",
    source: OFFICIAL_SRC,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "line-color": officialColor(),
      "line-width": ["case", ["boolean", ["get", "selected"], false], 3, 1.5],
      "line-dasharray": [2, 1.5],
    },
  });
  map.addLayer({
    id: "official-points",
    type: "circle",
    source: OFFICIAL_SRC,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": officialColor(),
      "circle-stroke-width": 2,
      "circle-radius": 14,
    },
  });
}

// citizen hazard reports: unmoderated by doctrine, so drawn as a distinct
// hollow marker that cannot be mistaken for a satellite detection
function addReportLayers(map: maplibregl.Map, data: FeatureCollection) {
  if (map.getSource(REPORTS_SRC)) return;
  map.addSource(REPORTS_SRC, { type: "geojson", data });
  map.addLayer({
    id: "report-points",
    type: "circle",
    source: REPORTS_SRC,
    paint: {
      "circle-color": token("--surface", "#ffffff"),
      "circle-opacity": 0.9,
      "circle-stroke-color": token("--risk-2", "#e4af00"),
      "circle-stroke-width": 2.5,
      "circle-radius": 6,
    },
  });
}

function addFireLayers(map: maplibregl.Map, data: FeatureCollection) {
  if (map.getSource(SRC)) return;
  const ring = token("--surface", "#ffffff");

  map.addSource(SRC, {
    type: "geojson",
    data,
    cluster: true,
    clusterRadius: 44,
    clusterMaxZoom: 9,
  });

  map.addLayer({
    id: "fire-groups",
    type: "circle",
    source: SRC,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": token("--risk-4", "#d40924"),
      "circle-opacity": 0.92,
      "circle-stroke-width": 2,
      "circle-stroke-color": ring,
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["get", "point_count"],
        2,
        14,
        10,
        20,
        50,
        28,
        150,
        36,
      ],
    },
  });

  map.addLayer({
    id: "fire-group-count",
    type: "symbol",
    source: SRC,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12,
      "text-font": ["Open Sans Semibold"],
      "text-allow-overlap": true,
    },
    paint: { "text-color": ring },
  });

  map.addLayer({
    id: "fire-selected",
    type: "circle",
    source: SRC,
    filter: ["==", ["get", "short_id"], "__none__"],
    paint: {
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": token("--accent", "#2171cc"),
      "circle-stroke-width": 3,
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4,
        10,
        8,
        18,
        12,
        28,
      ],
    },
  });

  const radius: maplibregl.ExpressionSpecification = [
    "interpolate",
    ["linear"],
    ["zoom"],
    4,
    ["match", ["get", "sizeRank"], 3, 5, 2, 4, 3],
    6,
    ["match", ["get", "sizeRank"], 3, 7.5, 2, 6, 4.5],
    9,
    ["match", ["get", "sizeRank"], 3, 14, 2, 11, 8],
    13,
    ["match", ["get", "sizeRank"], 3, 26, 2, 20, 14],
  ];

  map.addLayer({
    id: "fire-points",
    type: "circle",
    source: SRC,
    filter: [
      "all",
      ["!", ["has", "point_count"]],
      ["!", ["get", "unverified"]],
    ],
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0.95,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": ring,
      "circle-radius": radius,
    },
  });

  // spec 12.3: unverified detections stay hidden until zoom 9 unless switched on
  map.addLayer({
    id: "fire-unverified",
    type: "circle",
    source: SRC,
    filter: ["all", ["!", ["has", "point_count"]], ["get", "unverified"]],
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0.5,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": ring,
      "circle-stroke-opacity": 0.7,
      "circle-radius": radius,
    },
  });
}

export default function FireMap({
  clusters,
  selectedShortId,
  onSelect,
  official = EMPTY,
  selectedOfficialId = null,
  onSelectOfficial,
  reports = EMPTY,
  onSelectReport,
  center = [3.6, 35.8],
  zoom = 5.1,
  interactive = true,
  layers = DEFAULT_MAP_LAYERS,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const clustersRef = useRef(clusters);
  clustersRef.current = clusters;
  const officialRef = useRef(official);
  officialRef.current = official;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSelectOfficialRef = useRef(onSelectOfficial);
  onSelectOfficialRef.current = onSelectOfficial;
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
  const onSelectReportRef = useRef(onSelectReport);
  onSelectReportRef.current = onSelectReport;
  const initRef = useRef({ center, zoom, interactive });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const {
      center: initialCenter,
      zoom: initialZoom,
      interactive: isInteractive,
    } = initRef.current;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: isDark() ? BASEMAP.dark : BASEMAP.light,
      center: initialCenter,
      zoom: initialZoom,
      minZoom: 3.5,
      interactive: isInteractive,
      attributionControl: { compact: true },
    });

    // bottom-left: the layer toggle sits at the logical top-end, which mirrors to
    // top-left under RTL and would collide with a top-anchored control
    if (isInteractive) {
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "bottom-left",
      );
    }
    mapRef.current = map;

    const pick = (e: maplibregl.MapMouseEvent) => {
      const feats = map.queryRenderedFeatures(e.point, {
        layers: ["fire-points", "fire-unverified"],
      });
      const shortId = feats[0]?.properties?.["short_id"] as string | undefined;
      if (!shortId) return;
      const cluster = clustersRef.current.find((c) => c.short_id === shortId);
      if (cluster) onSelectRef.current?.(cluster);
    };

    const pickOfficial = (e: maplibregl.MapMouseEvent) => {
      if (
        map.queryRenderedFeatures(e.point, {
          layers: ["fire-points", "fire-unverified", "fire-groups"],
        }).length
      )
        return;
      const feats = map.queryRenderedFeatures(e.point, {
        layers: OFFICIAL_LAYERS,
      });
      const id = feats[0]?.properties?.["id"] as string | undefined;
      if (id) onSelectOfficialRef.current?.(id);
    };

    const pickReport = (e: maplibregl.MapMouseEvent) => {
      const id = map.queryRenderedFeatures(e.point, {
        layers: ["report-points"],
      })[0]?.properties?.["id"] as string | undefined;
      if (id) onSelectReportRef.current?.(id);
    };

    map.on("load", () => {
      addOfficialLayers(map, officialRef.current);
      addReportLayers(map, reportsRef.current);
      addFireLayers(map, toGeoJSON(clustersRef.current));
      readyRef.current = true;

      for (const layer of OFFICIAL_LAYERS) map.on("click", layer, pickOfficial);
      map.on("click", "report-points", pickReport);
      map.on(
        "mouseenter",
        "report-points",
        () => (map.getCanvas().style.cursor = "pointer"),
      );
      map.on(
        "mouseleave",
        "report-points",
        () => (map.getCanvas().style.cursor = ""),
      );

      map.on("click", "fire-points", pick);
      map.on("click", "fire-unverified", pick);
      map.on("click", "fire-groups", (e) => {
        const f = map.queryRenderedFeatures(e.point, {
          layers: ["fire-groups"],
        })[0];
        const clusterId = f?.properties?.["cluster_id"];
        if (!f || clusterId == null) return;
        const src = map.getSource(SRC) as maplibregl.GeoJSONSource;
        void src.getClusterExpansionZoom(clusterId).then((z) => {
          map.easeTo({
            center: (f.geometry as Point).coordinates as [number, number],
            zoom: z,
          });
        });
      });
      for (const layer of ["fire-points", "fire-unverified", "fire-groups"]) {
        map.on(
          "mouseenter",
          layer,
          () => (map.getCanvas().style.cursor = "pointer"),
        );
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
    });

    // basemap follows the app theme; layers must be re-added after setStyle
    const themeObserver = new MutationObserver(() => {
      const next = isDark() ? BASEMAP.dark : BASEMAP.light;
      if (
        map.getStyle()?.name &&
        next === (map as never as { _nadhirStyle?: string })._nadhirStyle
      )
        return;
      (map as never as { _nadhirStyle?: string })._nadhirStyle = next;
      map.setStyle(next);
      map.once("styledata", () => {
        addOfficialLayers(map, officialRef.current);
        addReportLayers(map, reportsRef.current);
        addFireLayers(map, toGeoJSON(clustersRef.current));
      });
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      themeObserver.disconnect();
      ro.disconnect();
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(toGeoJSON(clusters));
    };
    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [clusters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource(OFFICIAL_SRC) as
        maplibregl.GeoJSONSource | undefined;
      if (src)
        src.setData({
          ...official,
          features: official.features.map((f) => ({
            ...f,
            properties: {
              ...f.properties,
              selected: f.properties?.["id"] === selectedOfficialId,
            },
          })),
        });
    };
    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [official, selectedOfficialId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource(REPORTS_SRC) as
        maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(reports);
    };
    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [reports]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer("report-points"))
        map.setLayoutProperty(
          "report-points",
          "visibility",
          layers.reports ? "visible" : "none",
        );
      for (const id of OFFICIAL_LAYERS) {
        if (map.getLayer(id))
          map.setLayoutProperty(
            id,
            "visibility",
            layers.official ? "visible" : "none",
          );
      }
      for (const id of ["fire-points", "fire-groups", "fire-group-count"]) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(
            id,
            "visibility",
            layers.fires ? "visible" : "none",
          );
        }
      }
      if (map.getLayer("fire-unverified")) {
        map.setLayoutProperty(
          "fire-unverified",
          "visibility",
          layers.fires && layers.unverified ? "visible" : "none",
        );
        map.setLayerZoomRange("fire-unverified", layers.unverified ? 0 : 9, 24);
      }
    };
    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [layers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.getLayer("fire-selected")) return;
    map.setFilter("fire-selected", [
      "==",
      ["get", "short_id"],
      selectedShortId ?? "__none__",
    ]);
  }, [selectedShortId, clusters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedShortId) return;
    const target = clusters.find((c) => c.short_id === selectedShortId);
    if (target)
      map.easeTo({
        center: [target.lon, target.lat],
        zoom: Math.max(map.getZoom(), 9.5),
      });
  }, [selectedShortId, clusters]);

  return <div ref={containerRef} className="h-full w-full" />;
}
