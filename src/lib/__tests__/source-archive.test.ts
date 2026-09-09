import { describe, expect, it, vi } from "vitest";
import {
  ArchiveFailure,
  archivedFetch,
  createArchivedFetch,
  type SourceArchiveStore,
} from "../source-archive.server";
import {
  getSourceArchiveContext,
  withSourceArchiveContext,
} from "../source-archive-context.server";

const database = vi.hoisted(() => ({ upload: vi.fn(), insert: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    storage: { from: () => ({ upload: database.upload }) },
    from: () => ({ insert: database.insert }),
  },
}));

function setup() {
  const store = {
    putObject: vi
      .fn<SourceArchiveStore["putObject"]>()
      .mockResolvedValue(undefined),
    capture: vi
      .fn<SourceArchiveStore["capture"]>()
      .mockResolvedValue(undefined),
  };
  return { store, fetch: createArchivedFetch(store) };
}
describe("source archive transport", () => {
  it("accepts a storage409 as immutable object deduplication", async () => {
    database.upload.mockResolvedValue({ error: { statusCode: "409" } });
    database.insert.mockResolvedValue({ error: null });
    const response = await archivedFetch(
      "onm",
      "feed",
      "https://example.org",
      undefined,
      { fetchImpl: async () => new Response("duplicate") },
    );
    expect(await response.text()).toBe("duplicate");
    expect(database.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/),
      expect.any(Uint8Array),
      expect.objectContaining({ upsert: false }),
    );
    expect(database.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "captured" }),
    );
  });
  it("archives exact bytes before returning them to the parser", async () => {
    const { store, fetch } = setup();
    const bytes = new Uint8Array([0, 255, 128, 10]);
    const response = await fetch(
      "firms",
      "csv",
      "https://example.org/private-key/feed?token=secret",
      { headers: { Authorization: "Bearer secret" } },
      {
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(bytes, {
            headers: {
              "content-type": "application/octet-stream",
              etag: '"v1"',
              "set-cookie": "secret",
            },
          }),
        ),
        requestParams: { sensor: "VIIRS" },
      },
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(store.putObject.mock.calls[0]?.[1]).toEqual(bytes);
    expect(store.capture.mock.calls[0]?.[0]).toMatchObject({
      source_origin: "https://example.org",
      status: "captured",
      byte_length: 4,
      response_headers: { etag: '"v1"' },
      request_params: { sensor: "VIIRS" },
    });
    expect(JSON.stringify(store.capture.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(store.capture.mock.calls)).not.toContain(
      "private-key",
    );
    expect(store.putObject.mock.invocationCallOrder[0]).toBeLessThan(
      store.capture.mock.invocationCallOrder[0]!,
    );
  });
  it("addresses duplicate bytes identically but preserves each request observation", async () => {
    const { store, fetch } = setup();
    for (let i = 0; i < 2; i++)
      await fetch("onm", "feed", "https://example.org", undefined, {
        fetchImpl: async () => new Response("same"),
      });
    expect(store.putObject.mock.calls[0]?.[0]).toBe(
      store.putObject.mock.calls[1]?.[0],
    );
    expect(store.capture).toHaveBeenCalledTimes(2);
  });
  it("records 304 without fabricating a body", async () => {
    const { store, fetch } = setup();
    const response = await fetch(
      "ita_website",
      "feed",
      "https://example.org",
      undefined,
      { fetchImpl: async () => new Response(null, { status: 304 }) },
    );
    expect(response.status).toBe(304);
    expect(store.putObject).not.toHaveBeenCalled();
    expect(store.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "not_modified",
        sha256: null,
        storage_path: null,
        byte_length: 0,
      }),
    );
  });
  it("archives malformed HTTP error bodies and preserves HTTP status", async () => {
    const { store, fetch } = setup();
    const response = await fetch(
      "onm",
      "feed",
      "https://example.org",
      undefined,
      {
        fetchImpl: async () =>
          new Response("<html>bad gateway", { status: 502 }),
      },
    );
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("<html>bad gateway");
    expect(store.capture).toHaveBeenCalledWith(
      expect.objectContaining({ status: "captured", http_status: 502 }),
    );
  });
  it("records network failures without persisting error messages or request URLs", async () => {
    const { store, fetch } = setup();
    await expect(
      fetch("firms", "csv", "https://example.org/secret", undefined, {
        fetchImpl: async () => {
          throw new Error("failed https://example.org/secret");
        },
      }),
    ).rejects.toThrow();
    expect(store.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error_code: "network_error",
        http_status: null,
      }),
    );
    expect(JSON.stringify(store.capture.mock.calls)).not.toContain("secret");
  });
  it("fails closed and records a failed capture when storage fails", async () => {
    const { store, fetch } = setup();
    store.putObject.mockRejectedValue(new Error("private upstream secret"));
    await expect(
      fetch("onm", "feed", "https://example.org", undefined, {
        fetchImpl: async () => new Response("data"),
      }),
    ).rejects.toBeInstanceOf(ArchiveFailure);
    expect(store.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error_code: "storage_failed",
        storage_path: null,
      }),
    );
    expect(JSON.stringify(store.capture.mock.calls)).not.toContain("secret");
  });
  it("fails closed when metadata insertion fails", async () => {
    const { store, fetch } = setup();
    store.capture.mockRejectedValue(new Error("db unavailable"));
    await expect(
      fetch("onm", "feed", "https://example.org", undefined, {
        fetchImpl: async () => new Response("data"),
      }),
    ).rejects.toBeInstanceOf(ArchiveFailure);
  });
  it("records oversized response failure and never returns partial evidence", async () => {
    const { store, fetch } = setup();
    await expect(
      fetch("effis", "map", "https://example.org", undefined, {
        fetchImpl: async () =>
          new Response(new Uint8Array(32 * 1024 * 1024 + 1)),
      }),
    ).rejects.toBeInstanceOf(ArchiveFailure);
    expect(store.putObject).not.toHaveBeenCalled();
    expect(store.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error_code: "body_too_large",
        byte_length: 32 * 1024 * 1024 + 1,
      }),
    );
  });
  it("records broken body streams", async () => {
    const { store, fetch } = setup();
    await expect(
      fetch("effis", "map", "https://example.org", undefined, {
        fetchImpl: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error("secret"));
              },
            }),
          ),
      }),
    ).rejects.toBeInstanceOf(ArchiveFailure);
    expect(store.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error_code: "body_read_failed",
      }),
    );
  });
  it.each([
    { api_key: "secret" },
    { nested: { authorization: "secret" } },
    { url: "https://example.org/secret" },
  ])("rejects unsafe request descriptors", async (requestParams) => {
    const { store, fetch } = setup();
    const upstream = vi.fn();
    await expect(
      fetch("onm", "feed", "https://example.org", undefined, {
        requestParams,
        fetchImpl: upstream,
      }),
    ).rejects.toBeInstanceOf(ArchiveFailure);
    expect(upstream).not.toHaveBeenCalled();
    expect(store.capture).not.toHaveBeenCalled();
  });
  it("isolates concurrent source-job contexts", async () => {
    const { store, fetch } = setup();
    const run = (jobId: string) =>
      withSourceArchiveContext(
        { jobId, attempt: 2, contractVersion: 3, parserVersion: "v1" },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          await fetch("onm", "feed", "https://example.org", undefined, {
            fetchImpl: async () => new Response(jobId),
          });
          expect(getSourceArchiveContext()?.jobId).toBe(jobId);
        },
      );
    await Promise.all([run("job-a"), run("job-b")]);
    expect(store.capture.mock.calls.map(([row]) => row.job_id).sort()).toEqual([
      "job-a",
      "job-b",
    ]);
    expect(getSourceArchiveContext()).toBeUndefined();
  });
});
