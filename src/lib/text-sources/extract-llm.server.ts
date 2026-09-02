import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";

const MentionSchema = z.object({
  wilaya: z.string().nullable(),
  commune: z.string().nullable(),
  place: z.string().nullable(),
  kind: z.enum(["vegetation", "agricultural", "urban", "unknown"]),
  status: z.enum([
    "ongoing",
    "contained",
    "extinguished",
    "monitoring",
    "unknown",
  ]),
  count: z.number().int().min(1),
  evidence: z.string(),
});

const ExtractionSchema = z.object({ mentions: z.array(MentionSchema) });

export type LlmMention = z.infer<typeof MentionSchema>;

export type LlmExtractionInput = {
  text: string;
  wilayaHint: string | null;
  language: string;
};

export type LlmExtractionResult =
  | { skipped: true; reason: "no_api_key" }
  | { skipped: false; mentions: LlmMention[] };

type ParseParams = {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: "user"; content: string }[];
  output_config: { format: ReturnType<typeof zodOutputFormat>; effort: "low" };
};

export type LlmExtractionDependencies = {
  apiKey: string | undefined;
  parse: (params: ParseParams) => Promise<{
    parsed_output: z.infer<typeof ExtractionSchema> | null;
  }>;
};

const SYSTEM = `You extract wildfire incident mentions from official Algerian civil-protection or forestry posts.
Return only what the post states. Every mention must quote its evidence verbatim from the post.
One mention per named fire location. Do not infer locations that are not written. Ignore urban, vehicle and industrial fires (kind "urban").
Statuses: ongoing (operations continuing), contained (under control / regressing), extinguished (put out), monitoring (guarding, mopping up), unknown.
Kinds: vegetation (forest, scrub, maquis), agricultural (crops, hay, orchards, palm groves), urban, unknown.
Leave commune null when only a locality or a wilaya is named. Names stay in the post's language and spelling.`;

let sharedClient: Anthropic | null = null;

function defaultDependencies(): LlmExtractionDependencies {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  return {
    apiKey,
    parse: async (params) => {
      sharedClient ??= new Anthropic({ apiKey });
      const response = await sharedClient.messages.parse({
        ...params,
        output_config: params.output_config,
      });
      return {
        parsed_output:
          (response.parsed_output as z.infer<typeof ExtractionSchema> | null) ??
          null,
      };
    },
  };
}

export async function extractMentionsWithLlm(
  input: LlmExtractionInput,
  deps: LlmExtractionDependencies = defaultDependencies(),
): Promise<LlmExtractionResult> {
  if (!deps.apiKey) return { skipped: true, reason: "no_api_key" };
  const hint = input.wilayaHint
    ? `The post is filed under wilaya "${input.wilayaHint}"; use it only when the sentence names no other wilaya.\n`
    : "";
  const { parsed_output } = await deps.parse({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `${hint}Language: ${input.language}\n<post>\n${input.text}\n</post>`,
      },
    ],
    output_config: { format: zodOutputFormat(ExtractionSchema), effort: "low" },
  });
  if (!parsed_output)
    throw new Error("llm extraction returned no parsable output");
  const mentions = parsed_output.mentions.filter(
    (m) => m.evidence.length > 0 && input.text.includes(m.evidence),
  );
  return { skipped: false, mentions };
}
