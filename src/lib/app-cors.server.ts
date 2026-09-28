export const APP_ORIGINS: ReadonlySet<string> = new Set([
  "capacitor://localhost",
  "https://localhost",
]);

export function appOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  return origin && APP_ORIGINS.has(origin) ? origin : null;
}

export function appPreflight(request: Request, methods: string): Response {
  const origin = appOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": `${methods}, OPTIONS`,
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}

export function withAppCors(request: Request, response: Response): Response {
  const origin = appOrigin(request);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.append("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
