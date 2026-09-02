import { describe, expect, it } from "vitest";

import {
  DEFAULT_OPENROUTER_MODEL,
  extractMentionsWithLlm,
  type LlmExtractionDependencies,
  type OpenRouterRequest,
} from "@/lib/text-sources/extract-llm.server";

const text =
  "✅⏮️ حريق غابة منطقة صعبة المسلك ببلدية الولجة بولبلوط ولاية #سكيكدة، مع إقحام طائرتي الإطفاء، العملية متواصلة...";

const good = {
  wilaya: "سكيكدة",
  commune: "الولجة بولبلوط",
  place: null,
  kind: "vegetation",
  status: "ongoing",
  count: 1,
  evidence: "حريق غابة منطقة صعبة المسلك ببلدية الولجة بولبلوط",
};

function deps(
  content: string,
  over: Partial<LlmExtractionDependencies> = {},
): LlmExtractionDependencies & { calls: OpenRouterRequest[] } {
  const calls: OpenRouterRequest[] = [];
  return {
    apiKey: "sk-or-test",
    model: DEFAULT_OPENROUTER_MODEL,
    complete: async (request) => {
      calls.push(request);
      return { content };
    },
    calls,
    ...over,
  };
}

describe("extractMentionsWithLlm over OpenRouter", () => {
  it("skips without an API key and says so", async () => {
    const result = await extractMentionsWithLlm(
      { text, wilayaHint: null, language: "ar" },
      {
        apiKey: undefined,
        model: DEFAULT_OPENROUTER_MODEL,
        complete: async () => ({ content: "" }),
      },
    );
    expect(result).toEqual({ skipped: true, reason: "no_api_key" });
  });

  it("returns mentions whose evidence is quoted from the input", async () => {
    const d = deps(JSON.stringify({ mentions: [good] }));
    const result = await extractMentionsWithLlm(
      { text, wilayaHint: null, language: "ar" },
      d,
    );
    expect(result).toEqual({
      skipped: false,
      mentions: [expect.objectContaining({ commune: "الولجة بولبلوط" })],
    });
  });

  it("drops mentions whose evidence is not in the text", async () => {
    const d = deps(
      JSON.stringify({
        mentions: [{ ...good, evidence: "حريق ببلدية عزابة" }],
      }),
    );
    const result = await extractMentionsWithLlm(
      { text, wilayaHint: null, language: "ar" },
      d,
    );
    expect(result).toEqual({ skipped: false, mentions: [] });
  });

  it("asks for a strict JSON schema and sends the post as data in the user turn", async () => {
    const d = deps(JSON.stringify({ mentions: [] }));
    await extractMentionsWithLlm(
      { text, wilayaHint: "سكيكدة", language: "ar" },
      d,
    );
    const req = d.calls[0]!;
    expect(req.model).toBe(DEFAULT_OPENROUTER_MODEL);
    expect(req.response_format.type).toBe("json_schema");
    expect(req.response_format.json_schema.strict).toBe(true);
    expect(req.response_format.json_schema.schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["mentions"],
    });
    const system = req.messages.find((m) => m.role === "system")!;
    const user = req.messages.find((m) => m.role === "user")!;
    expect(system.content).not.toContain("الولجة");
    expect(user.content).toContain(text);
  });

  it("accepts a reply wrapped in a markdown fence", async () => {
    const d = deps(
      "```json\n" + JSON.stringify({ mentions: [good] }) + "\n```",
    );
    const result = await extractMentionsWithLlm(
      { text, wilayaHint: null, language: "ar" },
      d,
    );
    expect(result).toMatchObject({
      skipped: false,
      mentions: [expect.anything()],
    });
  });

  it("asks OpenRouter to route only to providers that honour the schema", async () => {
    const d = deps(JSON.stringify({ mentions: [] }));
    await extractMentionsWithLlm({ text, wilayaHint: null, language: "ar" }, d);
    expect(d.calls[0]!.provider).toEqual({ require_parameters: true });
  });

  it("fails loudly when the reply is not the expected shape", async () => {
    const d = deps(
      JSON.stringify({ mentions: [{ ...good, kind: "volcano" }] }),
    );
    await expect(
      extractMentionsWithLlm({ text, wilayaHint: null, language: "ar" }, d),
    ).rejects.toThrow(/llm extraction/);
  });
});
