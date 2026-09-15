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
it("repairs joined status quotes with one grounded LLM correction", async () => {
  const message =
    "🚨🚨 متابعة : يتم رفع وازاحة الشاحنتين محل الحادث بالطريق السيار شرق غرب قبل محطة الخدمات بابور سطيف اتجاه الجزائر حركة السير بطيئة في القطاع.";
  const incident = {
    ...output.incidents[0],
    evidence: "يتم رفع وازاحة الشاحنتين محل الحادث",
    location_text: "قبل محطة الخدمات بابور سطيف",
    location_evidence: "قبل محطة الخدمات بابور سطيف",
    current_status: "ongoing",
    status_evidence:
      "يتم رفع وازاحة الشاحنتين محل الحادث ... حركة السير بطيئة في القطاع.",
  };
  const corrected = {
    ...output,
    incidents: [
      { ...incident, status_evidence: "حركة السير بطيئة في القطاع." },
    ],
  };
  const d = deps({ ...output, incidents: [incident] });
  d.complete
    .mockResolvedValueOnce(JSON.stringify({ ...output, incidents: [incident] }))
    .mockResolvedValueOnce(JSON.stringify(corrected));
  expect(await extractItaReport({ ...post, message }, d)).toEqual(corrected);
  expect(d.complete).toHaveBeenCalledTimes(2);
  expect(d.complete).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("unsupported status evidence"),
        }),
      ]),
    }),
  );
});
it("stops after one failed repair instead of accepting unsupported evidence", async () => {
  const d = deps({
    ...output,
    incidents: [{ ...output.incidents[0], evidence: "invented" }],
  });
  await expect(extractItaReport(post, d)).rejects.toThrow(
    "unsupported event evidence",
  );
  expect(d.complete).toHaveBeenCalledTimes(2);
});
it("shares the report deadline with its repair request", async () => {
  const invalid = {
    ...output,
    incidents: [{ ...output.incidents[0], evidence: "invented" }],
  };
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        choices: [{ message: { content: JSON.stringify(invalid) } }],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        choices: [{ message: { content: JSON.stringify(output) } }],
      }),
    );
  vi.stubEnv("OPENROUTER_API_KEY", "test");
  vi.stubGlobal("fetch", request);
  try {
    expect(await extractItaReport(post)).toEqual(output);
    expect(request.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
    expect(request.mock.calls[1]?.[1].signal).toBe(
      request.mock.calls[0]?.[1].signal,
    );
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
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
