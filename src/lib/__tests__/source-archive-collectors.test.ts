import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const { archivedFetch, from, rpc } = vi.hoisted(() => ({
  archivedFetch: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/source-archive.server", () => ({
  archivedFetch,
  ArchiveFailure: class ArchiveFailure extends Error {},
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from, rpc },
}));
import { ArchiveFailure } from "@/lib/source-archive.server";
import { ingestFirms } from "@/lib/ingest/firms.server";
import { ingestFci, ingestS3 } from "@/lib/ingest/fci.server";
import { ingestOnm } from "@/lib/ingest/onm.server";
import { ingestEffis } from "@/lib/ingest/effis.server";
import { enrichClusterWinds } from "@/lib/ingest/weather.server";
import { runItaSource } from "@/lib/text-sources/ita-pipeline.server";
import { runTextSource } from "@/lib/text-sources/pipeline.server";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FIRMS_MAP_KEY", "secret-map-key");
});
afterEach(() => vi.unstubAllEnvs());

it("archives every FIRMS feed with scientific descriptors, excluding its credential path", async () => {
  archivedFetch.mockImplementation(
    async () => new Response("Invalid key", { status: 403 }),
  );
  await ingestFirms();
  expect(archivedFetch).toHaveBeenCalledTimes(4);
  for (const [source, endpoint, url, , options] of archivedFetch.mock.calls) {
    expect(source).toBe("firms");
    expect(endpoint).toBe("area_csv");
    expect(url).toContain("secret-map-key");
    expect(JSON.stringify(options)).not.toContain("secret-map-key");
    expect(options.requestParams).toMatchObject({
      bounds: "-3.2,33.2,9.7,37.6",
      days: 1,
    });
  }
  expect(from).not.toHaveBeenCalled();
});

it("archives all FCI and Sentinel-3 WFS layers before parsing", async () => {
  archivedFetch.mockImplementation(async () => Response.json({ features: [] }));
  await ingestFci();
  await ingestS3();
  expect(archivedFetch.mock.calls.map((c) => c[0])).toEqual([
    "fci",
    "s3_slstr",
    "s3_slstr",
  ]);
  expect(
    archivedFetch.mock.calls.every(
      (c) => c[4].requestParams.product && c[4].requestParams.filter,
    ),
  ).toBe(true);
});

it("archives invalid ONM and EFFIS responses before validation", async () => {
  archivedFetch.mockImplementation(async () => new Response("upstream error"));
  expect((await ingestOnm()).error).toBeTruthy();
  expect((await ingestEffis("2026-09-09")).error).toBeTruthy();
  expect(archivedFetch.mock.calls.map((c) => [c[0], c[1]])).toEqual([
    ["onm", "atom_feed"],
    ["effis", "danger_wms"],
  ]);
});

it("archives ONM detail XML and does not swallow its archive failure", async () => {
  const feed = readFileSync(
    new URL("./fixtures/onm-atom-sample.xml", import.meta.url),
    "utf8",
  );
  from.mockImplementation((table) => {
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      not: () => query,
      order: () => query,
      limit: () => query,
      range: () => query,
      upsert: async () => ({ error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data:
            table === "onm_vigilance"
              ? [
                  {
                    id: "cap",
                    cap_url: "https://ametvigilance.meteo.dz/CAPs/example.xml",
                  },
                ]
              : [],
          error: null,
        }).then(resolve),
    };
    return query;
  });
  archivedFetch
    .mockResolvedValueOnce(new Response(feed))
    .mockRejectedValueOnce(new ArchiveFailure("detail archive failed"));
  await expect(ingestOnm()).rejects.toThrow("detail archive failed");
  expect(archivedFetch.mock.calls.map((c) => c[1])).toEqual([
    "atom_feed",
    "cap_detail",
  ]);
});

it("archives DGPC preview HTML before the pure parser filters it", async () => {
  from.mockImplementation((table) => {
    const query = {
      select: () => query,
      eq: () => query,
      lt: () => query,
      order: () => query,
      limit: () => query,
      range: () => query,
      maybeSingle: async () => ({
        data: {
          id: "source",
          key: "dgpc_telegram",
          url: "https://t.me/s/protection_civile_dz",
          kind: "telegram_public",
          template: "dgpc_bulletin",
        },
        error: null,
      }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    expect([
      "text_sources",
      "source_documents",
      "document_extractions",
    ]).toContain(table);
    return query;
  });
  archivedFetch.mockResolvedValue(new Response("<html>No posts</html>"));
  await runTextSource("dgpc_telegram");
  expect(archivedFetch.mock.calls[0]?.slice(0, 3)).toEqual([
    "dgpc_telegram",
    "public_preview",
    "https://t.me/s/protection_civile_dz",
  ]);
});

it.each([ingestFirms, ingestFci, ingestOnm, ingestEffis])(
  "never swallows an archive failure",
  async (ingest) => {
    archivedFetch.mockRejectedValue(new ArchiveFailure("archive unavailable"));
    await expect(ingest()).rejects.toThrow("archive unavailable");
  },
);

it("archives weather enrichment without cluster or user identifiers", async () => {
  const query = {
    select: () => query,
    in: () => query,
    gte: () => query,
    order: () => query,
    limit: async () => ({ data: [{ id: "private-cluster", lat: 36, lon: 3 }] }),
  };
  from.mockReturnValue(query);
  archivedFetch.mockResolvedValue(Response.json({ current: {} }));
  await enrichClusterWinds();
  expect(archivedFetch.mock.calls[0]?.[0]).toBe("openmeteo_wind");
  expect(JSON.stringify(archivedFetch.mock.calls[0]?.[4])).not.toContain(
    "private-cluster",
  );
});

it("archives an ITA 304 before checkpointing or claiming pending extraction", async () => {
  const query = {
    select: () => query,
    eq: () => query,
    single: async () => ({ data: { etag: '"old"' }, error: null }),
    is: async () => ({ count: 0, error: null }),
  };
  from.mockReturnValue(query);
  archivedFetch.mockResolvedValue(new Response(null, { status: 304 }));
  rpc.mockImplementation(async (name) => ({
    data: name === "claim_ita_extractions" ? [] : 0,
    error: null,
  }));
  await runItaSource({ id: "job", attempt_count: 1 } as Parameters<
    typeof runItaSource
  >[0]);
  expect(archivedFetch).toHaveBeenCalledWith(
    "ita_website",
    "facebook_feed",
    "https://infotraficalgerie.com/api/facebook/",
    expect.objectContaining({
      headers: expect.objectContaining({ "If-None-Match": '"old"' }),
    }),
  );
  expect(archivedFetch.mock.invocationCallOrder[0]).toBeLessThan(
    rpc.mock.invocationCallOrder[0]!,
  );
});
