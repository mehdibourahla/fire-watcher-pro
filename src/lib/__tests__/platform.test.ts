import { expect, it, vi } from "vitest";
import { apiUrl, openOnWeb, publicUrl, webOnlyPath } from "@/lib/platform";

it("keeps API paths relative on the web", () => {
  expect(apiUrl("/api/private/account", false)).toBe("/api/private/account");
});

it("prefixes the app origin on native", () => {
  expect(apiUrl("/api/private/account", true, "https://nadhir.app")).toBe(
    "https://nadhir.app/api/private/account",
  );
});

it("builds public links on the site origin", () => {
  expect(publicUrl("/fire/abc?lang=fr", "https://nadhir.app")).toBe(
    "https://nadhir.app/fire/abc?lang=fr",
  );
});

it("marks admin, contribute, developers, webhooks and share cards as web-only", () => {
  for (const path of [
    "/admin",
    "/admin/fires",
    "/contribute",
    "/contribute/language/kab",
    "/developers",
    "/webhooks",
    "/share-card/incident/x",
  ])
    expect(webOnlyPath(path)).toBe(true);
  for (const path of [
    "/",
    "/fire/abc",
    "/survival",
    "/alerts",
    "/administration",
  ])
    expect(webOnlyPath(path)).toBe(false);
});

it("hands a website page to the system browser by navigating to it", () => {
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { assign } });
  openOnWeb("/contribute?x=1");
  expect(assign).toHaveBeenCalledWith("https://nadhir.app/contribute?x=1");
  vi.unstubAllGlobals();
});
