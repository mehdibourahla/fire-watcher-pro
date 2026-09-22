import { useEffect, useState } from "react";

// never prompts: a position is used only when the visitor already granted it
export function useGrantedPosition() {
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(
    null,
  );
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !("permissions" in navigator) ||
      !("geolocation" in navigator)
    )
      return;
    let cancelled = false;
    void navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled || status.state !== "granted") return;
        navigator.geolocation.getCurrentPosition((pos) => {
          if (!cancelled)
            setPosition({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
            });
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return position;
}
