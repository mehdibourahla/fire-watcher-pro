import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), watchdog: vi.fn() }));
vi.mock("nitro", () => ({ definePlugin: (plugin: unknown) => plugin }));
vi.mock("@/lib/ingest/operator-alerts.server", () => ({
  notifyOperatorOnWatchdog: mocks.watchdog,
}));
vi.mock("@/lib/source-scheduler.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/source-scheduler.server")>()),
  dispatchScheduledSources: mocks.dispatch,
}));
import plugin from "@/lib/source-scheduler.plugin.server";

afterEach(() => {
  vi.restoreAllMocks();
  mocks.dispatch.mockReset();
  mocks.watchdog.mockReset();
});

it.each(["pending", "failed"])(
  "runs the watchdog independently when dispatch is %s",
  async (state) => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const failed = new Error("enqueue unavailable");
    let release!: (value: unknown) => void;
    mocks.dispatch.mockImplementation(() =>
      state === "failed"
        ? Promise.reject(failed)
        : new Promise((resolve) => {
            release = resolve;
          }),
    );
    mocks.watchdog.mockResolvedValue({ sent: false });
    const hook = vi.fn();
    plugin({ hooks: { hook } } as never);
    const run = hook.mock.calls[0]![1]({
      controller: { scheduledTime: Date.parse("2026-09-21T12:00:00Z") },
      env: {
        NADHIR_APP_URL: "https://nadhir.app",
        NADHIR_CRON_SECRET: "runtime-secret",
      },
    }) as Promise<void>;
    const outcome = run.catch((error) => error);
    await Promise.resolve();
    expect(mocks.watchdog).toHaveBeenCalled();
    if (state === "pending") release({ enqueued: 1, dispatched: 1, failed: 0 });
    expect(await outcome).toEqual(state === "failed" ? failed : undefined);
  },
);

it("still completes dispatch when the watchdog fails", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.dispatch.mockResolvedValue({ enqueued: 1, dispatched: 1, failed: 0 });
  mocks.watchdog.mockRejectedValue(new Error("watchdog unavailable"));
  const hook = vi.fn();
  plugin({ hooks: { hook } } as never);
  await expect(
    hook.mock.calls[0]![1]({
      controller: { scheduledTime: Date.parse("2026-09-21T12:00:00Z") },
      env: {
        NADHIR_APP_URL: "https://nadhir.app",
        NADHIR_CRON_SECRET: "runtime-secret",
      },
    }),
  ).resolves.toBeUndefined();
  expect(mocks.dispatch).toHaveBeenCalledOnce();
  expect(logged).toHaveBeenCalledWith(
    expect.stringContaining("watchdog unavailable"),
  );
});
