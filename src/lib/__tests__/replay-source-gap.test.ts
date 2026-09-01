import { describe, expect, it, vi } from "vitest";

import { runReplayCommand } from "@/lib/replay-source-gap";

const environment = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
};

describe("runReplayCommand", () => {
  it.each([[[]], [["not-a-uuid"]]])(
    "rejects %j before creating a database client",
    async (args) => {
      const createClient = vi.fn();

      await expect(
        runReplayCommand(args, environment, createClient, vi.fn()),
      ).rejects.toThrow("recorded source gap UUID");
      expect(createClient).not.toHaveBeenCalled();
    },
  );

  it("enqueues exactly one replay and prints only public identifiers and state", async () => {
    const gapId = "11111111-1111-4111-8111-111111111111";
    const jobId = "22222222-2222-4222-8222-222222222222";
    const rpc = vi.fn().mockResolvedValue({ data: jobId, error: null });
    const createClient = vi.fn().mockReturnValue({ rpc });
    const write = vi.fn();

    await expect(
      runReplayCommand([gapId], environment, createClient, write),
    ).resolves.toBe(0);
    expect(createClient).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("enqueue_source_replay", {
      _gap_id: gapId,
    });
    expect(write).toHaveBeenCalledWith(
      JSON.stringify({ gapId, jobId, state: "queued" }),
    );
    expect(write.mock.calls.flat().join(" ")).not.toContain(
      environment.SUPABASE_SERVICE_ROLE_KEY,
    );
  });

  it("reports an expired replay window as unrecoverable", async () => {
    const gapId = "11111111-1111-4111-8111-111111111111";
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const createClient = vi.fn().mockReturnValue({ rpc });
    const write = vi.fn();

    await expect(
      runReplayCommand([gapId], environment, createClient, write),
    ).resolves.toBe(0);
    expect(write).toHaveBeenCalledWith(
      JSON.stringify({ gapId, jobId: null, state: "unrecoverable" }),
    );
  });
});
