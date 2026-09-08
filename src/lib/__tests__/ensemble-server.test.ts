import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/ensemble-icon-2026-09-08.json";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
      }),
    }),
  },
}));
import { handleEnsemblePreview } from "@/lib/ensemble.server";

const request = (query = "commune=0601", token = "valid") =>
  new Request(`https://nadhir.app/api/private/ensemble?${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("operator ensemble boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "operator-id" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.maybeSingle.mockResolvedValue({
      data: { code: "0601", name_fr: "Béjaïa", lat: 36.75, lon: 5.08 },
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(fixture)));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("verifies the bearer, checks database roles and both quota buckets before one bounded fetch", async () => {
    const response = await handleEnsemblePreview(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(mocks.getUser).toHaveBeenCalledWith("valid");
    expect(mocks.rpc).toHaveBeenCalledWith("has_any_role", {
      _user_id: "operator-id",
      _roles: ["operator", "admin"],
    });
    expect(mocks.rpc).toHaveBeenCalledWith("consume_rate_limit", {
      _bucket: "ensemble-preview:operator-id",
      _limit: 2,
      _window_seconds: 60,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("consume_rate_limit", {
      _bucket: "ensemble-preview:global",
      _limit: 20,
      _window_seconds: 3600,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get("forecast_days")).toBe("1");
    expect(new URL(String(url)).searchParams.get("models")).toBe("icon_global");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(await response.json()).toMatchObject({
      model_run_at: null,
      fetched_at: "2026-09-08T12:00:00.000Z",
      member_count: 40,
    });
  });

  it.each(["", "bad"])(
    "rejects absent or invalid bearer %s before provider work",
    async (token) => {
      mocks.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "invalid" },
      });
      expect(
        (await handleEnsemblePreview(request("commune=0601", token))).status,
      ).toBe(401);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("denies ordinary authenticated users", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await handleEnsemblePreview(request())).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed when role lookup or rate limiting fails", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "private details" },
    });
    const response = await handleEnsemblePreview(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private details");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns retry-after without fetching when quota is exhausted", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    const response = await handleEnsemblePreview(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed on limiter outage after authorization", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: true,
        error: { message: "database unavailable" },
      });
    expect((await handleEnsemblePreview(request())).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("enforces the shared hourly quota even below the user's limit", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    const response = await handleEnsemblePreview(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects unexpected upstream spatial extent", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ ...fixture, latitude: -30 }),
    );
    expect((await handleEnsemblePreview(request())).status).toBe(502);
  });
  it("bounds upstream bytes even when content-length is absent", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("x".repeat(256_001)));
    expect((await handleEnsemblePreview(request())).status).toBe(502);
  });
  it.each([
    "",
    "commune=0601&commune=0602",
    "commune=0601&forecast_days=16",
    "commune=0601,0602",
  ])("rejects unbounded inputs %s", async (query) => {
    expect((await handleEnsemblePreview(request(query))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requires a known commune", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await handleEnsemblePreview(request())).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects stale or malformed producer data without exposing upstream bodies", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: "private upstream detail" }),
    );
    const response = await handleEnsemblePreview(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private upstream detail");
  });
  it("cancels stalled upstream work after ten seconds", async () => {
    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const result = handleEnsemblePreview(request());
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await result).status).toBe(504);
  });
});
