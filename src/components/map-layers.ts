export type MapLayers = {
  fires: boolean;
  unverified: boolean;
  industrialSources: boolean;
  official: boolean;
};

export const DEFAULT_MAP_LAYERS: MapLayers = {
  fires: true,
  unverified: false,
  industrialSources: false,
  official: true,
};
