import { Geolocation } from "@capacitor/geolocation";

const DENIED = new Set(["OS-PLUG-GLOC-0003", "OS-PLUG-GLOC-0008"]);

function positionError(err: unknown): GeolocationPositionError {
  const code = (err as { code?: unknown } | null)?.code;
  return {
    code: DENIED.has(String(code)) ? 1 : code === "OS-PLUG-GLOC-0010" ? 3 : 2,
    message: err instanceof Error ? err.message : String(err),
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };
}

// WebKit re-asks "localhost would like to use your location" on every page load
export function installNativeGeolocation(nav: Navigator = navigator) {
  nav.geolocation.getCurrentPosition = (success, error, options) => {
    Geolocation.getCurrentPosition({
      enableHighAccuracy: options?.enableHighAccuracy ?? false,
      ...(options?.timeout === undefined ? {} : { timeout: options.timeout }),
      ...(options?.maximumAge === undefined
        ? {}
        : { maximumAge: options.maximumAge }),
    }).then(
      (position) => success(position as unknown as GeolocationPosition),
      (err: unknown) => error?.(positionError(err)),
    );
  };
  if (!("permissions" in nav)) return;
  const query = nav.permissions.query.bind(nav.permissions);
  nav.permissions.query = async (descriptor) => {
    if (descriptor.name !== "geolocation") return query(descriptor);
    const { location } = await Geolocation.checkPermissions();
    const state =
      location === "granted" || location === "denied" ? location : "prompt";
    return { state } as PermissionStatus;
  };
}
