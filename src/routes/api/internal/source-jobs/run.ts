import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

type SourceJobRouteDependencies = {
  authenticate: typeof authenticateCronRequest;
  execute: () => Promise<
    { claimed: false } | { claimed: true; contract: string; state: string }
  >;
};

const sourceJobRouteDependencies: SourceJobRouteDependencies = {
  authenticate: authenticateCronRequest,
  execute: async () => {
    const { executeNextSourceJob } =
      await import("@/lib/ingest/source-executor.server");
    return executeNextSourceJob({
      target: "cloudflare",
      workerId: `cloudflare:${crypto.randomUUID()}`,
    });
  },
};

export async function handleSourceJobRequest(
  request: Request,
  dependencies: SourceJobRouteDependencies = sourceJobRouteDependencies,
): Promise<Response> {
  const unauthorized = await dependencies.authenticate(request);
  if (unauthorized) return unauthorized;

  try {
    return Response.json(await dependencies.execute());
  } catch {
    console.error(JSON.stringify({ message: "source job request failed" }));
    return Response.json(
      { error: "Source job execution failed" },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/internal/source-jobs/run")({
  server: {
    handlers: {
      POST: ({ request }) => handleSourceJobRequest(request),
    },
  },
});
