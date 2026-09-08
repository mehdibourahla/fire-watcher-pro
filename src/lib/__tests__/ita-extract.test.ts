import { expect, it, vi } from "vitest";
import { extractItaReport } from "../text-sources/ita-extract.server";
const post = {
  id: "808412572528916_1511278197712051",
  uri: "traficalg",
  created_time: "2026-09-08T18:35:11+0000",
  message: "أشغال في البويرة\nاتجاه الجزائر",
  region: "Bouira",
  type: ["iTravaux"],
};
const output = {
  disposition: "incident_report",
  incidents: [
    {
      kind: "roadworks",
      summary_fr: "Travaux à Bouira en direction d’Alger.",
      evidence: "أشغال في البويرة",
      location_text: "البويرة",
      location_evidence: "في البويرة",
      direction_text: "الجزائر",
      direction_evidence: "اتجاه الجزائر",
      current_status: "unknown",
      status_evidence: null,
      region_assessment: "consistent",
      review_reasons: [],
    },
  ],
  review_reasons: [],
};
const deps = (value: unknown) => ({
  apiKey: "test",
  model: "test",
  complete: vi.fn(async () => JSON.stringify(value)),
});
it("retains grounded LLM interpretation and requests strict output", async () => {
  const d = deps(output);
  expect(await extractItaReport(post, d)).toEqual(output);
  expect(d.complete).toHaveBeenCalledWith(
    expect.objectContaining({
      response_format: expect.objectContaining({ type: "json_schema" }),
    }),
  );
});
it("rejects invented evidence", async () => {
  await expect(
    extractItaReport(
      post,
      deps({
        ...output,
        incidents: [{ ...output.incidents[0], evidence: "invented" }],
      }),
    ),
  ).rejects.toThrow("evidence");
});
it("requires evidence for a claimed current status", async () => {
  await expect(
    extractItaReport(
      post,
      deps({
        ...output,
        incidents: [{ ...output.incidents[0], current_status: "resolved" }],
      }),
    ),
  ).rejects.toThrow("status");
});
it("requires direction and location evidence separately", async () => {
  await expect(
    extractItaReport(
      post,
      deps({
        ...output,
        incidents: [{ ...output.incidents[0], direction_evidence: null }],
      }),
    ),
  ).rejects.toThrow("direction");
});
it("rejects invalid JSON shape and missing key visibly", async () => {
  await expect(extractItaReport(post, deps([]))).rejects.toThrow();
  await expect(
    extractItaReport(post, { ...deps(output), apiKey: undefined }),
  ).rejects.toThrow("OPENROUTER_API_KEY");
});
it("does not silently discard incidents in irrelevant reports", async () => {
  await expect(
    extractItaReport(
      post,
      deps({ ...output, disposition: "general_information" }),
    ),
  ).rejects.toThrow("disposition");
});
