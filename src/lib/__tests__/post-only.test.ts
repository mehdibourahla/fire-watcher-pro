import { describe, expect, it } from "vitest";

import { postOnlyMethodNotAllowed } from "@/lib/post-only.server";

describe("postOnlyMethodNotAllowed", () => {
  it("returns the private route JSON 405 contract without public API headers", async () => {
    const response = postOnlyMethodNotAllowed();

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({
      error: "method not allowed",
    });
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Allow")).toBe("POST");
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(response.headers.has("Cache-Control")).toBe(false);
  });
});
