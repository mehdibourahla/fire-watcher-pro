export const GRID = 0.01;
export const MIN_STATIC_SHARE = 0.65;
export const MIN_ACTIVE_DAYS = 5;
export const MIN_DETECTIONS = 10;
export const SCREEN_RADIUS_KM = 1.5;

export type CellKey = [number, number];

export function cellKey(lat: number, lon: number): CellKey {
  return [Math.round(lat / GRID), Math.round(lon / GRID)];
}

export function cellCentre([y, x]: CellKey): { lat: number; lon: number } {
  return {
    lat: Number((y * GRID).toFixed(6)),
    lon: Number((x * GRID).toFixed(6)),
  };
}

export function siteIdFor([y, x]: CellKey): string {
  return `dz-${y}-${x}`;
}

export function qualifies(cell: {
  staticShare: number;
  activeDays: number;
  detectionCount: number;
}): boolean {
  return (
    cell.staticShare >= MIN_STATIC_SHARE &&
    cell.activeDays >= MIN_ACTIVE_DAYS &&
    cell.detectionCount >= MIN_DETECTIONS
  );
}
