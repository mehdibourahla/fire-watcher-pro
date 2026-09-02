import { describe, expect, it } from "vitest";

import {
  runTextSourceWith,
  type TextSourcePipelineDependencies,
  type TextSourceStore,
} from "@/lib/text-sources/pipeline.server";
import type { OpenIncident } from "@/lib/text-sources/merge";
import type { TelegramPost } from "@/lib/text-sources/telegram-public";

const SKIKDA = "w-skikda";
const OTHER = "w-other";
const AZZABA = "c-azzaba";
const AIN_ZOUIT = "c-ain-zouit";
const FAR = "c-far";

const bulletin = (asOfHour: string, body: string) =>
  `🔴 الحالة العامة لحرائق الغطاء النباتي ليوم 02 سبتمبر 2026 على الساعة ${asOfHour}سا00د
🔴 العدد الإجمالي للحرائق: 3
🔴 عدد الحرائق التي تم إخمادها: 1
🔴 عدد الحرائق المتواصلة: 2
✅✅ الحرائق المتواصلة موزعة على:
⏮️⏮️ ولاية سكيكدة 02
🔴 أهم الحرائق
ولاية #سكيكدة:
${body}
#الحماية_المدنية_الجزائرية`;

function memoryStore() {
  const documents: { id: string; externalId: string }[] = [];
  const mentions: Record<string, unknown>[] = [];
  const incidents = new Map<
    string,
    OpenIncident & { mention_count: number; status: string }
  >();
  let seq = 0;
  const store: TextSourceStore = {
    loadSource: async (key) => ({
      id: "src-dgpc",
      key,
      kind: "telegram_public",
      url: "https://t.me/s/DGPCDZ",
      authority_tier: "national",
      language: "ar",
      wilaya_id: null,
      template: "dgpc_bulletin",
    }),
    knownExternalIds: async () => new Set(documents.map((d) => d.externalId)),
    insertDocuments: async (rows) =>
      rows.map((r) => {
        const id = `doc-${++seq}`;
        documents.push({ id, externalId: r.external_id });
        return { id, ...r };
      }),
    loadGazetteer: async () => ({
      wilayas: [
        { id: SKIKDA, name_ar: "سكيكدة" },
        { id: OTHER, name_ar: "باتنة" },
      ],
      communesByWilaya: new Map([
        [
          SKIKDA,
          [
            { id: AZZABA, name_ar: "عزابة", aliases: [] },
            { id: AIN_ZOUIT, name_ar: "عين زويت", aliases: [] },
          ],
        ],
        [OTHER, [{ id: FAR, name_ar: "بلدة بعيدة", aliases: [] }]],
      ]),
    }),
    insertMentions: async (rows) =>
      rows.map((r) => {
        const id = `m-${++seq}`;
        mentions.push({ id, ...r });
        return { id, ...r };
      }),
    openIncidents: async () => [...incidents.values()],
    createIncident: async (row) => {
      const id = `inc-${++seq}`;
      incidents.set(id, {
        ...row,
        id,
        area_id: row.commune_id ?? row.wilaya_id,
        mention_count: 1,
      });
      return id;
    },
    updateIncident: async (id, update) => {
      const cur = incidents.get(id)!;
      incidents.set(id, {
        ...cur,
        ...update,
        mention_count: cur.mention_count + 1,
      });
    },
    attachMention: async (mentionId, incidentId) => {
      const m = mentions.find((x) => x["id"] === mentionId)!;
      m["incident_id"] = incidentId;
    },
  };
  return { store, documents, mentions, incidents };
}

function deps(
  posts: TelegramPost[],
  store: TextSourceStore,
  llm: TextSourcePipelineDependencies["extractLlm"] = async () => ({
    skipped: true,
    reason: "no_api_key",
  }),
): TextSourcePipelineDependencies {
  return { store, fetchPosts: async () => posts, extractLlm: llm };
}

const post = (id: string, publishedAt: string, text: string): TelegramPost => ({
  externalId: `DGPCDZ/${id}`,
  publishedAt,
  text,
  url: `https://t.me/DGPCDZ/${id}`,
});

describe("runTextSource", () => {
  it("turns a bulletin into resolved mentions and one incident per commune", async () => {
    const { store, mentions, incidents } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "1",
            "2026-09-02T12:10:00Z",
            bulletin(
              "13",
              "✅⏮️ تسجيل حريقين ببلديتي عزابة وعين زويت، العملية متواصلة...",
            ),
          ),
        ],
        store,
      ),
    );
    expect(result).toMatchObject({
      fetched: 1,
      stored: 1,
      mentions: 2,
      resolved: 2,
      unresolved: 0,
      incidentsCreated: 2,
      incidentsUpdated: 0,
      llmSkipped: false,
    });
    expect(incidents.size).toBe(2);
    const azzaba = [...incidents.values()].find(
      (i) => i.commune_id === AZZABA,
    )!;
    expect(azzaba).toMatchObject({
      status: "ongoing",
      precision: "commune",
      authority_tier: "national",
      as_of: "2026-09-02T12:00:00.000Z",
    });
    expect(mentions.every((m) => typeof m["incident_id"] === "string")).toBe(
      true,
    );
  });

  it("attaches a later report to the same incident and updates its status", async () => {
    const { store, incidents } = memoryStore();
    await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "1",
            "2026-09-02T12:10:00Z",
            bulletin("13", "✅⏮️ حريق ببلدية عزابة، العملية متواصلة..."),
          ),
        ],
        store,
      ),
    );
    const second = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "2",
            "2026-09-02T19:05:00Z",
            bulletin("20", "✅⏮️ حريق ببلدية عزابة، تم إخماده نهائياً..."),
          ),
        ],
        store,
      ),
    );
    expect(second).toMatchObject({ incidentsCreated: 0, incidentsUpdated: 1 });
    const only = [...incidents.values()];
    expect(only).toHaveLength(1);
    expect(only[0]).toMatchObject({ status: "extinguished", mention_count: 2 });
  });

  it("sends unresolved lines to the LLM and records them as unresolved when it is skipped", async () => {
    const { store } = memoryStore();
    const calls: string[] = [];
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "1",
            "2026-09-02T12:10:00Z",
            bulletin("13", "✅⏮️ حريق ببلدية قرية مجهولة، العملية متواصلة..."),
          ),
        ],
        store,
        async (input) => {
          calls.push(input.text);
          return { skipped: true, reason: "no_api_key" };
        },
      ),
    );
    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({
      mentions: 0,
      unresolved: 1,
      llmSkipped: true,
    });
  });

  it("uses LLM mentions when they resolve against the gazetteer", async () => {
    const { store, incidents } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "1",
            "2026-09-02T12:10:00Z",
            bulletin("13", "✅⏮️ حريق ببلدية قرية مجهولة، العملية متواصلة..."),
          ),
        ],
        store,
        async () => ({
          skipped: false,
          mentions: [
            {
              wilaya: "سكيكدة",
              commune: "عين زويت",
              place: "قرية مجهولة",
              kind: "vegetation",
              status: "ongoing",
              count: 1,
              evidence: "حريق ببلدية قرية مجهولة",
            },
          ],
        }),
      ),
    );
    expect(result).toMatchObject({
      mentions: 1,
      resolved: 1,
      incidentsCreated: 1,
    });
    expect([...incidents.values()][0]).toMatchObject({
      commune_id: AIN_ZOUIT,
      place_text: "قرية مجهولة",
    });
  });

  it("does not duplicate a commune the template already resolved when the LLM re-emits it", async () => {
    const { store, mentions } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "1",
            "2026-09-02T12:10:00Z",
            bulletin(
              "13",
              "✅⏮️ تسجيل حريقين ببلديتي عزابة وقرية مجهولة، العملية متواصلة...",
            ),
          ),
        ],
        store,
        async () => ({
          skipped: false,
          mentions: [
            {
              wilaya: "سكيكدة",
              commune: "عزابة",
              place: null,
              kind: "vegetation",
              status: "ongoing",
              count: 1,
              evidence: "حريقين ببلديتي عزابة",
            },
            {
              wilaya: "سكيكدة",
              commune: "عين زويت",
              place: null,
              kind: "vegetation",
              status: "ongoing",
              count: 1,
              evidence: "قرية مجهولة",
            },
          ],
        }),
      ),
    );
    expect(result).toMatchObject({ mentions: 2, incidentsCreated: 2 });
    expect(mentions.filter((m) => m["commune_id"] === AZZABA)).toHaveLength(1);
  });

  it("resolves an LLM commune nationally when the hinted wilaya does not hold it", async () => {
    const { store, incidents } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "1",
            "2026-09-02T12:10:00Z",
            bulletin("13", "✅⏮️ حريق ببلدية بلدة بعيدة، العملية متواصلة..."),
          ),
        ],
        store,
        async () => ({
          skipped: false,
          mentions: [
            {
              wilaya: "سكيكدة",
              commune: "بلدة بعيدة",
              place: null,
              kind: "vegetation",
              status: "ongoing",
              count: 1,
              evidence: "حريق ببلدية بلدة بعيدة",
            },
          ],
        }),
      ),
    );
    expect(result).toMatchObject({ mentions: 1, incidentsCreated: 1 });
    expect([...incidents.values()][0]).toMatchObject({
      commune_id: FAR,
      wilaya_id: OTHER,
    });
  });

  it("stores but does not extract posts that are not land-fire bulletins", async () => {
    const { store, mentions } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "9",
            "2026-09-02T05:00:00Z",
            "#الحرائق_الحضرية_والصناعية\nحريق عدادات كهربائية بولاية #عين_الدفلى",
          ),
        ],
        store,
      ),
    );
    expect(result).toMatchObject({ stored: 1, mentions: 0, skippedPosts: 1 });
    expect(mentions).toHaveLength(0);
  });
});

describe("runTextSource LLM failures", () => {
  it("isolates a malformed LLM completion to its document", async () => {
    const { store, mentions } = memoryStore();
    let calls = 0;
    const flaky: TextSourcePipelineDependencies["extractLlm"] = async () => {
      calls += 1;
      if (calls === 1)
        throw new Error("llm extraction returned non-JSON content");
      return {
        skipped: false,
        mentions: [
          {
            wilaya: "سكيكدة",
            commune: "عزابة",
            place: null,
            kind: "vegetation",
            status: "ongoing",
            count: 1,
            evidence: "حريق غابة عزابة",
          },
        ],
      };
    };
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "20",
            "2026-09-02T09:00:00Z",
            bulletin("07", "✅⏮️ حريق ببلدية قرية مجهولة، العملية متواصلة..."),
          ),
          post(
            "21",
            "2026-09-02T09:05:00Z",
            bulletin(
              "07",
              "✅⏮️ حريق ببلدية بلدة أخرى مجهولة، العملية متواصلة...",
            ),
          ),
        ],
        store,
        flaky,
      ),
    );
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({ llmFailed: 1, unresolved: 1, mentions: 1 });
    expect(mentions).toHaveLength(1);

    const dead = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "22",
            "2026-09-02T09:10:00Z",
            bulletin(
              "13",
              "✅⏮️ حريق ببلدية قرية ثالثة مجهولة، العملية متواصلة...",
            ),
          ),
        ],
        store,
        async () => {
          throw new Error("openrouter 502");
        },
      ),
    );
    expect(dead.error).toMatch(/every llm extraction failed: openrouter 502/);
  });
});
