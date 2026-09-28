import { beforeEach, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  getCurrentPosition: vi.fn(),
  checkPermissions: vi.fn(),
}));
vi.mock("@capacitor/geolocation", () => ({ Geolocation: plugin }));

import { installNativeGeolocation } from "@/lib/native-geolocation";

const webQuery = vi.fn();
const webPosition = vi.fn();
let nav: Navigator;

beforeEach(() => {
  vi.resetAllMocks();
  nav = {
    geolocation: { getCurrentPosition: webPosition },
    permissions: { query: webQuery },
  } as unknown as Navigator;
  installNativeGeolocation(nav);
});

it("reads the position from the app's location service instead of WebKit", async () => {
  const position = { timestamp: 1, coords: { latitude: 36.7, longitude: 3.1 } };
  plugin.getCurrentPosition.mockResolvedValue(position);
  const got = await new Promise((resolve) =>
    nav.geolocation.getCurrentPosition(resolve, undefined, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 60_000,
    }),
  );
  expect(got).toBe(position);
  expect(plugin.getCurrentPosition).toHaveBeenCalledWith({
    enableHighAccuracy: true,
    timeout: 10_000,
    maximumAge: 60_000,
  });
  expect(webPosition).not.toHaveBeenCalled();
});

it("reports a refused permission, a timeout and anything else with the browser's codes", async () => {
  const codeFor = async (code: string) => {
    plugin.getCurrentPosition.mockRejectedValue(
      Object.assign(new Error(code), { code }),
    );
    const error = await new Promise<GeolocationPositionError>((resolve) =>
      nav.geolocation.getCurrentPosition(() => {}, resolve),
    );
    return error.code;
  };
  expect(await codeFor("OS-PLUG-GLOC-0003")).toBe(1);
  expect(await codeFor("OS-PLUG-GLOC-0008")).toBe(1);
  expect(await codeFor("OS-PLUG-GLOC-0010")).toBe(3);
  expect(await codeFor("OS-PLUG-GLOC-0002")).toBe(2);
});

it("answers the geolocation permission check from the app's permission and passes other checks through", async () => {
  plugin.checkPermissions.mockResolvedValue({
    location: "prompt-with-rationale",
  });
  expect((await nav.permissions.query({ name: "geolocation" })).state).toBe(
    "prompt",
  );
  plugin.checkPermissions.mockResolvedValue({ location: "granted" });
  expect((await nav.permissions.query({ name: "geolocation" })).state).toBe(
    "granted",
  );
  webQuery.mockResolvedValue({ state: "denied" });
  expect((await nav.permissions.query({ name: "notifications" })).state).toBe(
    "denied",
  );
  expect(webQuery).toHaveBeenCalledWith({ name: "notifications" });
});
