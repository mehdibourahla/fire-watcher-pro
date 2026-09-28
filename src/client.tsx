import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

import { startDurableStorage } from "@/lib/durable-storage";
import { installNativeGeolocation } from "@/lib/native-geolocation";
import { NATIVE } from "@/lib/platform";

function hydrate() {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  });
}

// the first render reads the Survival Pack synchronously, so restore it before React starts
if (NATIVE) {
  installNativeGeolocation();
  void startDurableStorage()
    .catch((error: unknown) =>
      console.error("durable storage unavailable", error),
    )
    .then(hydrate);
  void import("@capacitor/app").then(({ App }) =>
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.minimizeApp();
    }),
  );
} else hydrate();
