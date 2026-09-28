import { expect, it } from "vitest";
import { appPreflight, withAppCors } from "@/lib/app-cors.server";

const req = (origin: string | null) =>
  new Request("https://nadhir.app/api/private/account", {
    headers: origin ? { origin } : {},
  });

it("allows the two app origins without credentials", () => {
  for (const origin of ["capacitor://localhost", "https://localhost"]) {
    const res = appPreflight(req(origin), "DELETE");
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    expect(res.headers.get("access-control-allow-methods")).toBe(
      "DELETE, OPTIONS",
    );
    expect(res.headers.get("access-control-allow-headers")).toContain(
      "authorization",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  }
});

it("refuses a preflight from any other origin", () => {
  expect(appPreflight(req("https://evil.example"), "POST").status).toBe(403);
  expect(appPreflight(req("http://localhost"), "POST").status).toBe(403);
  expect(appPreflight(req(null), "POST").status).toBe(403);
});

it("stamps responses only for app origins", async () => {
  const native = withAppCors(
    req("https://localhost"),
    Response.json({ ok: true }, { status: 201 }),
  );
  expect(native.status).toBe(201);
  expect(native.headers.get("access-control-allow-origin")).toBe(
    "https://localhost",
  );
  expect(native.headers.get("vary")).toContain("Origin");
  expect(await native.json()).toEqual({ ok: true });
  const web = withAppCors(req("https://nadhir.app"), Response.json({}));
  expect(web.headers.get("access-control-allow-origin")).toBeNull();
});
