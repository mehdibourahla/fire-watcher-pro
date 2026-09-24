import { createFileRoute } from "@tanstack/react-router";

import { ZonesPage } from "@/components/zones/ZonesPage";
import { titledMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/_authenticated/zones")({
  head: () => ({
    meta: titledMeta("nav.account"),
  }),
  component: ZonesPage,
});
