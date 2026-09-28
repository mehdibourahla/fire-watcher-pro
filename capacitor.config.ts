/// <reference types="@capacitor-firebase/messaging" />
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.nadhir",
  appName: "Nadhir",
  webDir: "dist/client",
  backgroundColor: "#03332c",
  android: { allowMixedContent: false },
  // without viewport-fit=cover both platforms keep the WebView inside the system bars
  ios: { contentInset: "always" },
  plugins: {
    FirebaseMessaging: { presentationOptions: ["alert", "sound"] },
  },
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          "@capacitor-firebase/messaging": { symlink: true },
        },
      },
    },
  },
};

export default config;
