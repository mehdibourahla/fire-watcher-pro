import { describe, expect, it } from "vitest";

import { clusterWeatherUpdate } from "@/lib/ingest/weather.server";

describe("clusterWeatherUpdate", () => {
  it("maps an Open-Meteo current block onto the cluster columns", () => {
    expect(
      clusterWeatherUpdate({
        wind_speed_10m: 21.6,
        wind_direction_10m: 225,
        wind_gusts_10m: 48.2,
        vapour_pressure_deficit: 2.31,
        soil_moisture_0_to_1cm: 0.083,
      }),
    ).toEqual({
      wind_speed_kmh: 21.6,
      wind_dir_deg: 225,
      spread_bearing_deg: 45,
      wind_gust_kmh: 48.2,
      vpd_kpa: 2.31,
      soil_moisture_m3m3: 0.083,
    });
  });

  it("keeps the wind when a fuel variable is missing, and drops the row without wind", () => {
    expect(
      clusterWeatherUpdate({ wind_speed_10m: 10, wind_direction_10m: 90 }),
    ).toMatchObject({
      wind_gust_kmh: null,
      vpd_kpa: null,
      soil_moisture_m3m3: null,
    });
    expect(clusterWeatherUpdate({ wind_gusts_10m: 30 })).toBeNull();
    expect(clusterWeatherUpdate(undefined)).toBeNull();
  });
});
