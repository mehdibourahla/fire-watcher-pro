import { beforeEach, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { retryTextDocument } from "@/lib/admin-text-recovery";
beforeEach(() => rpc.mockReset());
it("requests the audited recovery RPC for the selected document", async () => {
  rpc.mockResolvedValue({ error: null });
  await retryTextDocument("selected-document");
  expect(rpc).toHaveBeenCalledWith("retry_text_document", {
    _id: "selected-document",
  });
});
it("does not expose database or provider diagnostics to the UI", async () => {
  rpc.mockResolvedValue({ error: { message: "private provider data" } });
  await expect(retryTextDocument("selected-document")).rejects.toThrow(
    "text_recovery_retry_failed",
  );
});
