import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv(
    "FIREBASE_SERVICE_ACCOUNT",
    JSON.stringify({
      project_id: "test",
      client_email: "test@example.invalid",
      private_key: "AA==",
      token_uri: "https://oauth2.googleapis.com/token",
    }),
  );
  vi.spyOn(crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
  vi.spyOn(crypto.subtle, "sign").mockResolvedValue(new ArrayBuffer(32));
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "access" }))
      .mockResolvedValueOnce(
        new Response("UNREGISTERED secret-device-token", { status: 404 }),
      ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("rejects an unregistered device without exposing its token", async () => {
  const { fcmSend } = await import("@/lib/ingest/fcm.server");
  await expect(
    fcmSend({
      token: "secret-device-token",
      notification: { title: "TEST", body: "test" },
      webpush: {
        headers: { TTL: "60" },
        fcm_options: { link: "https://nadhir.app" },
      },
      data: { kind: "test" },
    }),
  ).rejects.toThrow("fcm send failed (404)");
  const body = JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body));
  expect(body.message.token).toBe("secret-device-token");
  expect(body.message.topic).toBeUndefined();
});
it("preserves existing empty-topic handling", async () => {
  const { fcmSend } = await import("@/lib/ingest/fcm.server");
  await expect(
    fcmSend({
      topic: "v1.commune.0000.en",
      notification: { title: "TEST", body: "test" },
      webpush: { fcm_options: { link: "https://nadhir.app" } },
      data: { kind: "fire", severity: "Severe", broadcast_id: "test" },
    }),
  ).resolves.toBeUndefined();
});
