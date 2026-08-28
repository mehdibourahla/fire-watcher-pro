import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => ({
  server: { host: "::", port: 8080, strictPort: true },
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
  // maplibre spawns its worker from a sibling file the dep optimizer does not emit,
  // which silently breaks GeoJSON sources (fire layers never render)
  optimizeDeps: { exclude: ["maplibre-gl"] },
  plugins: [
    tailwindcss(),
    tsConfigPaths(),
    tanstackStart({
      // TanStack Start's bundled server entry is redirected to src/server.ts (our SSR error wrapper)
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    ...(command === "build"
      ? [
          nitro({
            preset: "cloudflare-module",
            cloudflare: { nodeCompat: true, deployConfig: true },
          }),
        ]
      : []),
    viteReact(),
  ],
}));
