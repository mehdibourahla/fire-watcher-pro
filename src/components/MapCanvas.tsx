import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

import type { FeatureCollection } from "geojson";

import type { MapLayers } from "./FireMap";
import type { FireCluster } from "@/lib/nadhir";

const FireMap = lazy(() => import("./FireMap"));

type Props = {
  clusters: FireCluster[];
  selectedShortId?: string | null;
  onSelect?: (cluster: FireCluster) => void;
  official?: FeatureCollection;
  selectedOfficialId?: string | null;
  onSelectOfficial?: (id: string) => void;
  center?: [number, number];
  zoom?: number;
  interactive?: boolean;
  layers?: MapLayers;
};

function MapSkeleton() {
  return <div className="h-full w-full animate-pulse bg-muted" />;
}

export function MapCanvas(props: Props) {
  return (
    <ClientOnly fallback={<MapSkeleton />}>
      <Suspense fallback={<MapSkeleton />}>
        <FireMap {...props} />
      </Suspense>
    </ClientOnly>
  );
}
