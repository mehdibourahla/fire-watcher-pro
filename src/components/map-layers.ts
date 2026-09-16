export type MapLayers = {
  fires: boolean;
  unverified: boolean;
  official: boolean;
  reports: boolean;
};

export const DEFAULT_MAP_LAYERS: MapLayers = {
  fires: true,
  unverified: false,
  official: true,
  reports: true,
};
