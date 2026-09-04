import { z } from "zod/v4";

const KINDS = ["vegetation", "agricultural", "urban", "unknown"] as const;
const STATUSES = [
  "ongoing",
  "contained",
  "extinguished",
  "monitoring",
  "unknown",
] as const;

const MentionSchema = z.object({
  wilaya: z.string().nullable(),
  commune: z.string().nullable(),
  place: z.string().nullable(),
  kind: z.enum(KINDS),
  status: z.enum(STATUSES),
  count: z.number().int(),
  evidence: z.string(),
});

const ExtractionSchema = z.object({ mentions: z.array(MentionSchema) });

export type LlmMention = z.infer<typeof MentionSchema>;

// hand-written: strict mode rejects the minimum/maximum keywords zod emits
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    mentions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          wilaya: { type: ["string", "null"] },
          commune: { type: ["string", "null"] },
          place: { type: ["string", "null"] },
          kind: { type: "string", enum: [...KINDS] },
          status: { type: "string", enum: [...STATUSES] },
          count: { type: "integer" },
          evidence: { type: "string" },
        },
        required: [
          "wilaya",
          "commune",
          "place",
          "kind",
          "status",
          "count",
          "evidence",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["mentions"],
  additionalProperties: false,
} as const;

export const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.5-flash";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type LlmExtractionInput = {
  text: string;
  wilayaHint: string | null;
  language: string;
};

export type LlmExtractionResult =
  | { skipped: true; reason: "no_api_key" }
  | { skipped: false; mentions: LlmMention[] };

export type OpenRouterRequest = {
  model: string;
  messages: { role: "system" | "user"; content: string }[];
  response_format: {
    type: "json_schema";
    json_schema: { name: string; strict: true; schema: typeof RESPONSE_SCHEMA };
  };
  temperature: number;
  max_tokens: number;
  provider: { require_parameters: true };
};

export type LlmExtractionDependencies = {
  apiKey: string | undefined;
  model: string;
  complete: (request: OpenRouterRequest) => Promise<{ content: string }>;
};

const SYSTEM = `You extract wildfire incident mentions from official Algerian civil-protection or forestry posts.
Return only what the post states. Every mention must quote its evidence verbatim from the post.
One mention per named fire location. Do not infer locations that are not written. Ignore urban, vehicle and industrial fires (kind "urban").
Statuses: ongoing (operations continuing), contained (under control / regressing), extinguished (put out), monitoring (guarding, mopping up), unknown.
Kinds: vegetation (forest, scrub, maquis), agricultural (crops, hay, orchards, palm groves), urban, unknown.
Leave commune null when only a locality or a wilaya is named. Names stay in the post's language and spelling. count is the number of fires the sentence attributes to that location, at least 1.`;

// cheaper models sometimes wrap the object in a markdown fence despite the schema
function stripFence(content: string): string {
  const m = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(content);
  return m ? m[1]! : content;
}

async function completeWithOpenRouter(
  apiKey: string,
  request: OpenRouterRequest,
): Promise<{ content: string }> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "http-referer": "https://nadhir.app",
      "x-title": "Nadhir",
    },
    body: JSON.stringify(request),
  });
  if (!res.ok)
    throw new Error(
      `openrouter ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  const body = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
    error?: { message?: string };
  };
  if (body.error)
    throw new Error(`openrouter: ${body.error.message ?? "error"}`);
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string")
    throw new Error("openrouter: empty completion");
  return { content };
}

function defaultDependencies(): LlmExtractionDependencies {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  return {
    apiKey,
    model: process.env["OPENROUTER_MODEL"] || DEFAULT_OPENROUTER_MODEL,
    complete: (request) => completeWithOpenRouter(apiKey ?? "", request),
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
  const { content } = await deps.complete({
    model: deps.model,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `${hint}Language: ${input.language}\n<post>\n${input.text}\n</post>`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "fire_mentions",
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
    temperature: 0,
    max_tokens: 8192,
    provider: { require_parameters: true },
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(content));
  } catch {
    throw new Error("llm extraction returned non-JSON content");
  }
  const result = ExtractionSchema.safeParse(parsed);
  if (!result.success)
    throw new Error(
      `llm extraction returned an unexpected shape: ${result.error.message.slice(0, 200)}`,
    );
  const mentions = result.data.mentions
    .filter((m) => m.evidence.length > 0 && input.text.includes(m.evidence))
    .map((m) => ({ ...m, count: Math.max(1, m.count) }));
  return { skipped: false, mentions };
}
