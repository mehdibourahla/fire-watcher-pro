import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

import { OutlookGrid } from "@/components/forecast/OutlookGrid";

const DAYS = ["2026-09-25", "2026-09-26", "2026-09-27"];

describe("OutlookGrid", () => {
  it("keeps the other rows when one source fails", () => {
    const html = renderToStaticMarkup(
      <OutlookGrid
        days={DAYS}
        place="Batna"
        onm={{
          status: "ok",
          cells: [
            { state: "warning", level: 3, events: ["storm"] },
            { state: "none" },
            { state: "not_issued" },
          ],
        }}
        fire={{ status: "error", retry: () => undefined }}
        weather={{ status: "ok", cells: [null, null, null] }}
        air={{ status: "loading" }}
      />,
    );
    expect(html).toContain("outlook.onmLevel.3");
    expect(html).toContain("outlook.event.storm");
    expect(html).toContain("outlook.onmNone");
    expect(html).toContain("outlook.onmNotIssued");
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(html).toContain("outlook.rowError");
    expect(html).toContain("outlook.notPublished");
    expect(html).toContain('colSpan="3"');
  });
});
