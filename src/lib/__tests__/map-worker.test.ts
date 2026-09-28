import { expect, it } from "vitest";

import { mapWorkerUrl } from "@/lib/map-worker";

it("leaves http(s) pages to MapLibre's own worker lookup", () => {
  expect(mapWorkerUrl("https://nadhir.app/fire/x")).toBeNull();
  expect(mapWorkerUrl("https://localhost/")).toBeNull();
});

it("points the iOS app at the bundled worker", () => {
  expect(mapWorkerUrl("capacitor://localhost/survival")).toBe(
    "capacitor://localhost/assets/maplibre-gl-worker.mjs",
  );
});
