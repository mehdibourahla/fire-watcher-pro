import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseEnsemble, type EnsemblePreview } from "@/lib/ensemble";

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", ...headers },
  });
}

export async function handleEnsemblePreview(
  request: Request,
): Promise<Response> {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json({ error: "Authentication required" }, 401);
  try {
    const { data: auth, error: authError } =
      await supabaseAdmin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: "Invalid session" }, 401);
    const { data: allowed, error: roleError } = await supabaseAdmin.rpc(
      "has_any_role",
      {
        _user_id: auth.user.id,
        _roles: ["operator", "admin"],
      },
    );
    if (roleError || allowed == null)
      return json({ error: "Authorization unavailable" }, 503);
    if (allowed !== true)
      return json({ error: "Operator access required" }, 403);

    const params = new URL(request.url).searchParams;
    const code = params.get("commune");
    if (params.size !== 1 || !code || !/^\d{4}$/.test(code))
      return json({ error: "Provide one four-digit commune code" }, 400);
    for (const bucket of [
      {
        _bucket: `ensemble-preview:${auth.user.id}`,
        _limit: 2,
        _window_seconds: 60,
      },
      { _bucket: "ensemble-preview:global", _limit: 20, _window_seconds: 3600 },
    ]) {
      const { data, error } = await supabaseAdmin.rpc(
        "consume_rate_limit",
        bucket,
      );
      if (error || data == null)
        return json({ error: "Preview quota unavailable" }, 503);
      if (data !== true)
        return json({ error: "Preview quota exhausted" }, 429, {
          "Retry-After": String(bucket._window_seconds),
        });
    }
    const { data: commune, error } = await supabaseAdmin
      .from("admin_units")
      .select("code, name_fr, lat, lon")
      .eq("level", "commune")
      .eq("code", code)
      .maybeSingle();
    if (error) return json({ error: "Commune lookup unavailable" }, 503);
    if (!commune) return json({ error: "Unknown commune" }, 404);
    if (!Number.isFinite(commune.lat) || !Number.isFinite(commune.lon))
      return json({ error: "Commune coordinates unavailable" }, 503);

    const url = new URL("https://ensemble-api.open-meteo.com/v1/ensemble");
    url.search = new URLSearchParams({
      latitude: String(commune.lat),
      longitude: String(commune.lon),
      hourly: "temperature_2m,precipitation,wind_speed_10m",
      models: "icon_global",
      forecast_days: "1",
      timezone: "UTC",
      wind_speed_unit: "kmh",
      precipitation_unit: "mm",
      temperature_unit: "celsius",
    }).toString();
    const date = new Date().toISOString().slice(0, 10);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok || !response.body)
        throw new Error("Ensemble upstream unavailable");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      let bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 256_000) {
          await reader.cancel();
          throw new Error("Ensemble payload too large");
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      const forecast = parseEnsemble(JSON.parse(text), date);
      if (
        Math.abs(forecast.grid.latitude - commune.lat) > 1 ||
        Math.abs(forecast.grid.longitude - commune.lon) > 1
      )
        throw new Error("Ensemble grid outside requested location");
      const preview: EnsemblePreview = {
        ...forecast,
        commune: { code: commune.code, name_fr: commune.name_fr },
        fetched_at: new Date().toISOString(),
        model_run_at: null,
      };
      return json(preview);
    } catch {
      return json(
        {
          error: controller.signal.aborted
            ? "Ensemble provider timed out"
            : "Ensemble provider returned unavailable or invalid data",
        },
        controller.signal.aborted ? 504 : 502,
      );
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return json({ error: "Ensemble preview unavailable" }, 503);
  }
}
