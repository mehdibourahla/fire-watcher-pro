import { describe, expect, it } from "vitest";

import { isDeliverableUrl } from "@/lib/webhooks.server";

describe("isDeliverableUrl", () => {
  it("accepts public https endpoints", () => {
    expect(isDeliverableUrl("https://hooks.example.com/nadhir")).toBe(true);
    expect(isDeliverableUrl("https://example.com:8443/hook")).toBe(true);
  });

  it("rejects non-https schemes", () => {
    for (const url of [
      "http://hooks.example.com/x",
      "file:///etc/passwd",
      "ftp://example.com/x",
      "not a url",
    ]) {
      expect(isDeliverableUrl(url), url).toBe(false);
    }
  });

  it("rejects loopback, private and link-local targets", () => {
    for (const url of [
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.0.0.5/x",
      "https://172.16.0.1/x",
      "https://172.31.255.255/x",
      "https://192.168.1.1/x",
      "https://0.0.0.0/x",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/x",
      "https://box.local/x",
      "https://svc.internal/x",
    ]) {
      expect(isDeliverableUrl(url), url).toBe(false);
    }
  });

  it("keeps public addresses that merely look adjacent to private ranges", () => {
    expect(isDeliverableUrl("https://172.15.0.1/x")).toBe(true);
    expect(isDeliverableUrl("https://172.32.0.1/x")).toBe(true);
    expect(isDeliverableUrl("https://192.169.1.1/x")).toBe(true);
  });
});
