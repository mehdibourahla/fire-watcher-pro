import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";
import type { Situation } from "./civil-map";

function position(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

function ring(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 4 || !value.every(position))
    return false;
  const first = value[0] as number[];
  const last = value[value.length - 1] as number[];
  return first[0] === last[0] && first[1] === last[1];
}

function polygonCoordinates(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(ring);
}

function administrativeGeometry(
  value: unknown,
): value is Polygon | MultiPolygon {
  if (!value || typeof value !== "object") return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  return geometry.type === "Polygon"
    ? polygonCoordinates(geometry.coordinates)
    : geometry.type === "MultiPolygon" &&
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length > 0 &&
        geometry.coordinates.every(polygonCoordinates);
}

export function situationAreaId(item: Situation): string | null {
  if (item.source === "civil") return item.ended ? null : item.areaId;
  if (item.source === "onm") return item.data.wilaya_id;
  if (item.source !== "official") return null;
  return item.data.precision === "wilaya"
    ? item.data.wilaya_id
    : item.data.commune_id;
}

export function civilMapGeoJSON(
  items: Situation[],
  geometries: ReadonlyMap<string, unknown>,
  label: (item: Situation) => string,
  selectedId?: string,
): {
  official: FeatureCollection;
  warnings: FeatureCollection;
  reports: FeatureCollection;
} {
  const result = {
    official: { type: "FeatureCollection", features: [] } as FeatureCollection,
    warnings: { type: "FeatureCollection", features: [] } as FeatureCollection,
    reports: { type: "FeatureCollection", features: [] } as FeatureCollection,
  };
  for (const item of items) {
    if (item.source === "satellite" || (item.source === "civil" && item.ended))
      continue;
    const collection =
      result[
        item.source === "onm"
          ? "warnings"
          : item.source === "citizen" || item.source === "civil"
            ? "reports"
            : "official"
      ];
    const properties = {
      id: item.source === "civil" ? item.id : item.data.id,
      situationId: item.id,
      category: item.category,
      source: item.source,
      label: label(item),
      status:
        item.source === "onm"
          ? item.data.severity
          : item.source === "civil"
            ? item.data.state
            : item.data.status,
      selected: item.id === selectedId,
      precision:
        item.source === "civil"
          ? (item.data.area?.level ?? "administrative")
          : item.source === "official"
            ? item.data.precision
            : item.source === "onm"
              ? "wilaya"
              : "point",
      ...(item.source === "citizen"
        ? { kind: item.data.kind, sighting: item.data.sighting }
        : {}),
    };
    const areaId = situationAreaId(item);
    const geometry = areaId ? geometries.get(areaId) : undefined;
    if (item.id === selectedId && administrativeGeometry(geometry)) {
      collection.features.push({
        type: "Feature",
        id: `${item.id}:area`,
        geometry,
        properties: { ...properties, area: true },
      });
    }
    if (position([item.lon, item.lat])) {
      const point: Feature = {
        type: "Feature",
        id: `${item.id}:point`,
        geometry: { type: "Point", coordinates: [item.lon!, item.lat!] },
        properties: { ...properties, area: false },
      };
      collection.features.push(point);
    }
  }
  return result;
}
