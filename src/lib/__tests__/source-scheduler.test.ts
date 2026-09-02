import { describe, expect, it, vi } from "vitest";

import {
  dispatchScheduledSources,
  watchdogDue,
} from "@/lib/source-scheduler.server";
import { handleSourceJobRequest } from "@/routes/api/internal/source-jobs/run";

const env = {
  NADHIR_APP_URL: "https://nadhir.app",
  NADHIR_CRON_SECRET: "runtime-secret",
};

describe("dispatchScheduledSources", () => {
  it("enqueues the controller timestamp and drains the chain in waves", async () => {
    const enqueue = vi.fn().mockResolvedValue(11);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));

    await expect(
      dispatchScheduledSources(
        Date.parse("2026-08-31T20:07:00.000Z"),
        env,
        fetchImpl,
        enqueue,
      ),
    ).resolves.toEqual({ enqueued: 11, dispatched: 10, failed: 0 });

    expect(enqueue).toHaveBeenCalledWith(
      "2026-08-31T20:07:00.000Z",
      "cloudflare",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(10);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url).toBe("https://nadhir.app/api/internal/source-jobs/run");
      expect(init).toMatchObject({
        method: "POST",
        headers: { authorization: "Bearer runtime-secret" },
      });
      expect(init.body).toBeUndefined();
      expect(String(url)).not.toContain("runtime-secret");
    }
  });

  it("rejects before dispatching when durable enqueue fails", async () => {
    const fetchImpl = vi.fn();

    await expect(
      dispatchScheduledSources(
        Date.parse("2026-08-31T20:07:00.000Z"),
        env,
        fetchImpl,
        vi.fn().mockRejectedValue(new Error("enqueue failed")),
      ),
    ).rejects.toThrow("enqueue failed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails the Cron Event when every one-job dispatch fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      dispatchScheduledSources(
        Date.parse("2026-08-31T20:07:00.000Z"),
        env,
        fetchImpl,
        vi.fn().mockResolvedValue(11),
      ),
    ).rejects.toThrow("All source job dispatches failed");
  });

  it("reports partial dispatch without exposing the secret", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValue(new Response(null, { status: 500 }));

    const result = await dispatchScheduledSources(
      Date.parse("2026-08-31T20:07:00.000Z"),
      env,
      fetchImpl,
      vi.fn().mockResolvedValue(11),
    );

    expect(result).toEqual({ enqueued: 11, dispatched: 1, failed: 9 });
    expect(JSON.stringify(result)).not.toContain(env.NADHIR_CRON_SECRET);
  });
});

describe("watchdogDue", () => {
  it("runs the watchdog on five-minute boundaries only", () => {
    expect(watchdogDue(Date.parse("2026-09-02T06:05:00Z"))).toBe(true);
    expect(watchdogDue(Date.parse("2026-09-02T06:00:30Z"))).toBe(true);
    expect(watchdogDue(Date.parse("2026-09-02T06:07:00Z"))).toBe(false);
  });
});

describe("internal source job route", () => {
  const request = new Request(
    "https://nadhir.app/api/internal/source-jobs/run",
    { method: "POST" },
  );

  it("does not execute when authentication rejects the request", async () => {
    const execute = vi.fn();
    const response = await handleSourceJobRequest(request, {
      authenticate: vi
        .fn()
        .mockResolvedValue(new Response("Unauthorized", { status: 401 })),
      execute,
    });

    expect(response.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns only the sanitized execution result", async () => {
    const response = await handleSourceJobRequest(request, {
      authenticate: vi.fn().mockResolvedValue(null),
      execute: vi.fn().mockResolvedValue({
        claimed: true,
        contract: "firms",
        state: "succeeded",
      }),
    });

    await expect(response.json()).resolves.toEqual({
      claimed: true,
      contract: "firms",
      state: "succeeded",
    });
  });

  it("returns a generic error without leaking completion diagnostics", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleSourceJobRequest(request, {
      authenticate: vi.fn().mockResolvedValue(null),
      execute: vi
        .fn()
        .mockRejectedValue(new Error("private token and upstream payload")),
    });

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private token");
    expect(logged).not.toHaveBeenCalledWith(expect.stringContaining("token"));
    logged.mockRestore();
  });
});

describe("wave budget", () => {
  const env2 = {
    NADHIR_APP_URL: "https://nadhir.app",
    NADHIR_CRON_SECRET: "runtime-secret",
  };

  it("stops starting waves once the budget is spent", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    let clock = 0;
    const now = () => {
      clock += 9_000;
      return clock;
    };

    const result = await dispatchScheduledSources(
      Date.parse("2026-08-31T20:07:00.000Z"),
      env2,
      fetchImpl,
      vi.fn().mockResolvedValue(1),
      now,
    );
    expect(result.dispatched).toBeLessThan(10);
    expect(result.dispatched).toBeGreaterThan(0);
  });

  it("always runs the first wave, however little budget is left", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    let call = 0;
    const result = await dispatchScheduledSources(
      Date.parse("2026-08-31T20:07:00.000Z"),
      env2,
      fetchImpl,
      vi.fn().mockResolvedValue(1),
      () => (call++ === 0 ? 0 : 10 ** 12),
    );
    expect(result.dispatched).toBe(2);
  });
});
