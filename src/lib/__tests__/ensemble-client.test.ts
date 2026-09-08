import { afterEach, expect, it, vi } from "vitest";
const session = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: session } },
}));
import { fetchEnsemblePreview } from "@/lib/ensemble-preview";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("sends the current bearer only to the private preview endpoint", async () => {
  session.mockResolvedValue({
    data: { session: { access_token: "current-bearer" } },
    error: null,
  });
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ model: "icon_global" }));
  vi.stubGlobal("fetch", fetcher);
  await fetchEnsemblePreview("0601");
  expect(fetcher).toHaveBeenCalledWith(
    "/api/private/ensemble?commune=0601",
    expect.objectContaining({
      headers: { authorization: "Bearer current-bearer" },
      cache: "no-store",
    }),
  );
});

it("reports expired login before requesting data", async () => {
  session.mockResolvedValue({ data: { session: null }, error: null });
  vi.stubGlobal("fetch", vi.fn());
  await expect(fetchEnsemblePreview("0601")).rejects.toThrow("signIn");
  expect(fetch).not.toHaveBeenCalled();
});

it("surfaces quota failure without retrying automatically", async () => {
  session.mockResolvedValue({
    data: { session: { access_token: "token" } },
    error: null,
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "Preview quota exhausted" }, { status: 429 }),
      ),
  );
  await expect(fetchEnsemblePreview("0601")).rejects.toThrow("quota");
  expect(fetch).toHaveBeenCalledTimes(1);
});
