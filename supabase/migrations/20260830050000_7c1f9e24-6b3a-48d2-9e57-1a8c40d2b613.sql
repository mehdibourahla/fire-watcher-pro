-- Zonal statistics over the commune polygons: WorldCover class fractions and
-- Copernicus DEM slope/aspect. Stored whole because Mediterranean fire runs in
-- shrub and grass, which the forest_fraction scalar alone discards.
alter table admin_units add column landcover jsonb;
alter table admin_units add column terrain jsonb;
