import { describe, expect, it } from "vitest";

import {
  extractMentionsWithLlm,
  type LlmExtractionDependencies,
} from "@/lib/text-sources/extract-llm.server";

const text =
  "✅⏮️ حريق غابة منطقة صعبة المسلك ببلدية الولجة بولبلوط ولاية #سكيكدة، مع إقحام طائرتي الإطفاء، العملية متواصلة...";

function deps(
  parsed: unknown,
): LlmExtractionDependencies & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    apiKey: "sk-test",
    parse: async (params) => {
      calls.push(params);
      return { parsed_output: parsed as never };
    },
    calls,
  };
}

describe("extractMentionsWithLlm", () => {
  it("skips without an API key and says so", async () => {
    const result = await extractMentionsWithLlm(
      { text, wilayaHint: null, language: "ar" },
      { apiKey: undefined, parse: async () => ({ parsed_output: null }) },
    );
    expect(result).toEqual({ skipped: true, reason: "no_api_key" });
  });

  it("returns mentions whose evidence is quoted from the input", async () => {
    const d = deps({
      mentions: [
        {
          wilaya: "سكيكدة",
          commune: "الولجة بولبلوط",
          place: null,
          kind: "vegetation",
          status: "ongoing",
          count: 1,
          evidence: "حريق غابة منطقة صعبة المسلك ببلدية الولجة بولبلوط",
        },
      ],
    });
    const result = await extractMentionsWithLlm(
      { text, wilayaHint: null, language: "ar" },
      d,
    );
    expect(result).toEqual({
      skipped: false,
      mentions: [
        expect.objectContaining({
          commune: "الولجة بولبلوط",
          wilaya: "سكيكدة",
        }),
      ],
    });
  });

  it("drops mentions whose evidence is not in the text", async () => {
    const d = deps({
      mentions: [
        {
          wilaya: "سكيكدة",
          commune: "عزابة",
          place: null,
          kind: "vegetation",
          status: "ongoing",
          count: 1,
          evidence: "حريق ببلدية عزابة",
        },
      ],
    });
    const result = await extractMentionsWithLlm(
      { text, wilayaHint: null, language: "ar" },
      d,
    );
    expect(result).toEqual({ skipped: false, mentions: [] });
  });

  it("sends the post as data in the user turn, never in the system prompt", async () => {
    const d = deps({ mentions: [] });
    await extractMentionsWithLlm(
      { text, wilayaHint: "سكيكدة", language: "ar" },
      d,
    );
    const params = d.calls[0] as {
      system: string;
      messages: { role: string; content: string }[];
      model: string;
    };
    expect(params.model).toBe("claude-opus-5");
    expect(params.system).not.toContain("الولجة");
    expect(params.messages[0]!.content).toContain(text);
  });
});
