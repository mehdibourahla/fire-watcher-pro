import { describe, expect, it } from "vitest";

import {
  runTextSourceWith,
  type DocumentInsert,
  type TextSourcePipelineDependencies,
  type TextSourceStore,
} from "@/lib/text-sources/pipeline.server";
import type { LlmMention } from "@/lib/text-sources/extract-llm.server";
import type { OpenIncident } from "@/lib/text-sources/merge";
import type { TelegramPost } from "@/lib/text-sources/telegram-public";

const SKIKDA = "w-skikda";
const OTHER = "w-other";
const AZZABA = "c-azzaba";
const AIN_ZOUIT = "c-ain-zouit";
const FAR = "c-far";

const bulletin = (
  asOfHour: string,
  distribution: string,
  body: string,
  ongoing = 2,
) =>
  `🔴 الحالة العامة لحرائق الغطاء النباتي ليوم 02 سبتمبر 2026 على الساعة ${asOfHour}سا00د
🔴 العدد الإجمالي للحرائق: 3
🔴 عدد الحرائق التي تم إخمادها: 1
🔴 عدد الحرائق المتواصلة: ${ongoing}
✅✅ الحرائق المتواصلة موزعة على:
${distribution}
🔴 أهم الحرائق
ولاية #سكيكدة:
${body}
#الحماية_المدنية_الجزائرية`;

const mention = (over: Partial<LlmMention>): LlmMention => ({
  wilaya: "سكيكدة",
  commune: "عزابة",
  place: null,
  kind: "vegetation",
  status: "ongoing",
  count: 1,
  evidence: "حريق ببلدية عزابة، العملية متواصلة...",
  ...over,
});

const llmWith =
  (...mentions: LlmMention[]): TextSourcePipelineDependencies["extractLlm"] =>
  async () => ({ skipped: false, mentions });

function memoryStore() {
  const documents: { id: string; externalId: string }[] = [];
  const mentions: Record<string, unknown>[] = [];
  const incidents = new Map<
    string,
    OpenIncident & { mention_count: number; status: string }
  >();
  const unlisted = new Map<string, string>();
  const stored = new Map<string, DocumentInsert & { id: string }>();
  const retry = new Map<string, DocumentInsert & { id: string }>();
  const confirmed: { communeId: string; asOf: string; mentionId: string }[] =
    [];
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
        const full = { id, ...r };
        stored.set(id, full);
        return full;
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
      if (update.unlisted_at === null) unlisted.delete(id);
      incidents.set(id, {
        ...cur,
        ...update,
        mention_count: cur.mention_count + 1,
      });
    },
    retryableDocuments: async () => [...retry.values()],
    mentionKeys: async (ids) =>
      new Set(
        mentions
          .filter((m) => ids.includes(m["document_id"] as string))
          .map(
            (m) =>
              `${m["document_id"]}:${m["commune_id"] ?? ""}:${m["evidence"]}`,
          ),
      ),
    recordExtractionFailure: async (documentId) => {
      const doc = stored.get(documentId);
      if (doc) retry.set(documentId, doc);
    },
    clearExtractionFailure: async (documentId) => {
      retry.delete(documentId);
    },
    confirmClusters: async (rows) => {
      for (const row of rows) confirmed.push(row);
      return rows.length;
    },
    listedIncidents: async (before) =>
      [...incidents.values()]
        .filter((i) => !unlisted.has(i.id) && i.last_reported_at < before)
        .map((i) => ({ id: i.id, area_id: i.area_id })),
    markUnlisted: async (ids, asOf) => {
      for (const id of ids) unlisted.set(id, asOf);
    },
    attachMention: async (mentionId, incidentId) => {
      const m = mentions.find((x) => x["id"] === mentionId)!;
      m["incident_id"] = incidentId;
    },
  };
  return { store, documents, mentions, incidents, unlisted, confirmed, retry };
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

const skikda2 = "⏮️⏮️ ولاية سكيكدة 02";
const twoFires =
  "✅⏮️ حريق ببلدية عزابة، العملية متواصلة...\n✅⏮️ حريق ببلدية عين زويت، العملية متواصلة...";

describe("runTextSource", () => {
  it("turns the model's mentions into resolved mentions and one incident per commune", async () => {
    const { store, mentions, incidents } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [post("1", "2026-09-02T12:10:00Z", bulletin("13", skikda2, twoFires))],
        store,
        llmWith(mention({}), mention({ commune: "عين زويت" })),
      ),
    );
    expect(result).toMatchObject({
      fetched: 1,
      stored: 1,
      mentions: 2,
      resolved: 2,
      unresolved: 0,
      gated: 0,
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
    expect(mentions.every((m) => m["extractor"] === "llm")).toBe(true);
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
            bulletin("13", "⏮️⏮️ ولاية سكيكدة 01", twoFires),
          ),
        ],
        store,
        llmWith(mention({})),
      ),
    );
    const second = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "2",
            "2026-09-02T19:05:00Z",
            bulletin(
              "20",
              "⏮️⏮️ لا يوجد (00)",
              "✅⏮️ حريق ببلدية عزابة، تم إخماده نهائياً...",
            ),
          ),
        ],
        store,
        llmWith(mention({ status: "extinguished" })),
      ),
    );
    expect(second).toMatchObject({ incidentsCreated: 0, incidentsUpdated: 1 });
    const only = [...incidents.values()];
    expect(only).toHaveLength(1);
    expect(only[0]).toMatchObject({ status: "extinguished", mention_count: 2 });
  });

  it("keeps a document for retry when the model is skipped for lack of a key", async () => {
    const { store, retry, mentions } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [post("1", "2026-09-02T12:10:00Z", bulletin("13", skikda2, twoFires))],
        store,
      ),
    );
    expect(result).toMatchObject({
      mentions: 0,
      unresolved: 1,
      llmSkipped: true,
    });
    expect(mentions).toHaveLength(0);
    expect(retry.size).toBe(1);
  });

  it("counts a commune the gazetteer cannot place as unresolved", async () => {
    const { store } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [post("1", "2026-09-02T12:10:00Z", bulletin("13", skikda2, twoFires))],
        store,
        llmWith(mention({ commune: "قرية مجهولة" })),
      ),
    );
    expect(result).toMatchObject({ mentions: 1, unresolved: 1 });
  });

  it("resolves a commune nationally when the hinted wilaya does not hold it", async () => {
    const { store, incidents } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "1",
            "2026-09-02T12:10:00Z",
            bulletin(
              "13",
              "⏮️⏮️ ولاية باتنة 01",
              "✅⏮️ حريق ببلدية بلدة بعيدة، العملية متواصلة...",
            ),
          ),
        ],
        store,
        llmWith(mention({ commune: "بلدة بعيدة" })),
      ),
    );
    expect(result).toMatchObject({ mentions: 1, incidentsCreated: 1 });
    expect([...incidents.values()][0]).toMatchObject({
      commune_id: FAR,
      wilaya_id: OTHER,
    });
  });

  it("stores but neither extracts nor calls the model for posts that are not land fires", async () => {
    const { store, mentions } = memoryStore();
    let calls = 0;
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
        async () => {
          calls += 1;
          return { skipped: false, mentions: [] };
        },
      ),
    );
    expect(result).toMatchObject({ stored: 1, mentions: 0, skippedPosts: 1 });
    expect(mentions).toHaveLength(0);
    expect(calls).toBe(0);
  });
});

describe("distribution gate", () => {
  it("drops a commune in a wilaya the bulletin's distribution does not list", async () => {
    const { store, mentions } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [post("1", "2026-09-02T12:10:00Z", bulletin("13", skikda2, twoFires))],
        store,
        llmWith(
          mention({}),
          mention({ wilaya: "باتنة", commune: "بلدة بعيدة" }),
        ),
      ),
    );
    expect(result).toMatchObject({ mentions: 2, gated: 1 });
    expect(mentions.map((m) => m["commune_id"])).toEqual([AZZABA, null]);
  });

  it("falls back to wilaya precision when the model names more communes than the distribution counts", async () => {
    const { store, mentions, incidents } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "1",
            "2026-09-02T12:10:00Z",
            bulletin("13", "⏮️⏮️ ولاية سكيكدة 01", twoFires),
          ),
        ],
        store,
        llmWith(mention({}), mention({ commune: "عين زويت" })),
      ),
    );
    expect(result).toMatchObject({ mentions: 1, gated: 2 });
    expect(mentions[0]).toMatchObject({
      wilaya_id: SKIKDA,
      commune_id: null,
      precision: "wilaya",
      fire_count: 1,
      status: "ongoing",
      extractor: "template",
      evidence: "⏮️⏮️ ولاية سكيكدة 01",
    });
    expect(incidents.size).toBe(1);
  });

  it("fills the distribution's remainder with a wilaya-level mention", async () => {
    const { store, mentions, incidents } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [post("1", "2026-09-02T12:10:00Z", bulletin("13", skikda2, twoFires))],
        store,
        llmWith(mention({})),
      ),
    );
    expect(result).toMatchObject({
      mentions: 2,
      gated: 0,
      incidentsCreated: 2,
    });
    expect(mentions.map((m) => [m["commune_id"], m["fire_count"]])).toEqual([
      [AZZABA, 1],
      [null, 1],
    ]);
    expect([...incidents.values()].map((i) => i.precision)).toEqual([
      "commune",
      "wilaya",
    ]);
  });

  it("ignores the model's own commune-less distribution mentions", async () => {
    const { store, mentions } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [post("1", "2026-09-02T12:10:00Z", bulletin("13", skikda2, twoFires))],
        store,
        llmWith(
          mention({
            commune: null,
            count: 2,
            evidence: "⏮️⏮️ ولاية سكيكدة 02",
          }),
          mention({}),
          mention({ commune: "عين زويت" }),
        ),
      ),
    );
    expect(result).toMatchObject({ mentions: 2, gated: 0 });
    expect(mentions.every((m) => m["commune_id"] !== null)).toBe(true);
  });

  it("lets an extinguished mention through without a distribution entry", async () => {
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
              "⏮️⏮️ لا يوجد (00)",
              "✅⏮️ حريق ببلدية عزابة، تم إخماده",
            ),
          ),
        ],
        store,
        llmWith(mention({ status: "extinguished" })),
      ),
    );
    expect(result).toMatchObject({ mentions: 1, gated: 0 });
    expect(mentions[0]).toMatchObject({
      commune_id: AZZABA,
      status: "extinguished",
    });
  });

  it("gates every ongoing commune when the bulletin says no fire is ongoing", async () => {
    const { store, mentions } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "1",
            "2026-09-02T12:10:00Z",
            bulletin("13", "⏮️⏮️ لا يوجد (00)", twoFires, 0),
          ),
        ],
        store,
        llmWith(mention({})),
      ),
    );
    expect(result).toMatchObject({ mentions: 0, gated: 1 });
    expect(mentions).toHaveLength(0);
  });

  it("caps ongoing communes by the header total when the distribution is unreadable", async () => {
    const { store } = memoryStore();
    const within = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "1",
            "2026-09-02T12:10:00Z",
            bulletin("13", "⏮️⏮️ موزعة على ولايتين", twoFires, 2),
          ),
        ],
        store,
        llmWith(mention({}), mention({ commune: "عين زويت" })),
      ),
    );
    expect(within).toMatchObject({ mentions: 2, gated: 0 });
    const over = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "2",
            "2026-09-02T14:10:00Z",
            bulletin("15", "⏮️⏮️ موزعة على ولايتين", twoFires, 1),
          ),
        ],
        store,
        llmWith(mention({}), mention({ commune: "عين زويت" })),
      ),
    );
    expect(over).toMatchObject({ mentions: 0, gated: 2 });
  });

  it("distrusts a distribution whose counts exceed the header total", async () => {
    const { store, mentions } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "1",
            "2026-09-02T12:10:00Z",
            bulletin("13", skikda2, twoFires, 1),
          ),
        ],
        store,
        llmWith(mention({})),
      ),
    );
    expect(result).toMatchObject({ mentions: 1, gated: 0 });
    expect(mentions.map((m) => m["commune_id"])).toEqual([AZZABA]);
  });

  it("a monitoring commune consumes its wilaya's count like an ongoing one", async () => {
    const { store, mentions } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "1",
            "2026-09-02T12:10:00Z",
            bulletin("13", "⏮️⏮️ ولاية سكيكدة 01", twoFires, 1),
          ),
        ],
        store,
        llmWith(mention({ status: "monitoring" })),
      ),
    );
    expect(result).toMatchObject({ mentions: 1, gated: 0 });
    expect(mentions[0]).toMatchObject({
      commune_id: AZZABA,
      status: "monitoring",
    });
  });

  it("does not gate a standalone incident post", async () => {
    const { store } = memoryStore();
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "11",
            "2026-09-02T14:05:00Z",
            "حريق أحراش ببلدية بلدة بعيدة، ولاية باتنة، العملية متواصلة...",
          ),
        ],
        store,
        llmWith(mention({ wilaya: "باتنة", commune: "بلدة بعيدة" })),
      ),
    );
    expect(result).toMatchObject({
      mentions: 1,
      gated: 0,
      incidentsCreated: 1,
    });
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
      return { skipped: false, mentions: [mention({})] };
    };
    const result = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post("20", "2026-09-02T09:00:00Z", bulletin("07", skikda2, twoFires)),
          post("21", "2026-09-02T09:05:00Z", bulletin("07", skikda2, twoFires)),
        ],
        store,
        flaky,
      ),
    );
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({ llmFailed: 1, unresolved: 1, mentions: 2 });
    expect(mentions).toHaveLength(2);

    const dead = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [post("22", "2026-09-02T09:10:00Z", bulletin("13", skikda2, twoFires))],
        store,
        async () => {
          throw new Error("openrouter 502");
        },
      ),
    );
    expect(dead.error).toMatch(/every llm extraction failed: openrouter 502/);
  });
});

describe("bulletin coverage", () => {
  it("unlists an incident the next full bulletin does not name, and re-lists it when it returns", async () => {
    const { store, incidents, unlisted } = memoryStore();
    const both = llmWith(mention({}), mention({ commune: "عين زويت" }));

    const first = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [post("1", "2026-09-02T08:05:00Z", bulletin("07", skikda2, twoFires))],
        store,
        both,
      ),
    );
    expect(first.incidentsCreated).toBe(2);
    expect(first.incidentsUnlisted).toBe(0);

    const second = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "2",
            "2026-09-02T14:05:00Z",
            bulletin("13", "⏮️⏮️ ولاية سكيكدة 01", twoFires),
          ),
        ],
        store,
        llmWith(mention({})),
      ),
    );
    expect(second.incidentsUnlisted).toBe(1);
    const dropped = [...incidents.values()].find(
      (i) => i.commune_id === AIN_ZOUIT,
    )!;
    expect(unlisted.has(dropped.id)).toBe(true);
    expect(dropped.status).toBe("ongoing");

    const third = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [post("3", "2026-09-02T18:05:00Z", bulletin("17", skikda2, twoFires))],
        store,
        both,
      ),
    );
    expect(third.incidentsUnlisted).toBe(0);
    expect(unlisted.has(dropped.id)).toBe(false);
  });

  it("a single-incident post unlists nothing", async () => {
    const { store } = memoryStore();
    await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "10",
            "2026-09-02T08:05:00Z",
            bulletin("07", "⏮️⏮️ ولاية سكيكدة 01", twoFires),
          ),
        ],
        store,
        llmWith(mention({})),
      ),
    );
    const run = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "11",
            "2026-09-02T14:05:00Z",
            "حريق أحراش ببلدية عين زويت، ولاية سكيكدة، العملية متواصلة...",
          ),
        ],
        store,
        llmWith(mention({ commune: "عين زويت" })),
      ),
    );
    expect(run.incidentsUnlisted).toBe(0);
  });
});

describe("extraction retry", () => {
  it("re-extracts a document whose completion failed", async () => {
    const { store, mentions, retry } = memoryStore();
    let calls = 0;
    const flaky: TextSourcePipelineDependencies["extractLlm"] = async () => {
      calls += 1;
      if (calls === 1) throw new Error("openrouter 502");
      return {
        skipped: false,
        mentions: [mention({}), mention({ commune: "عين زويت" })],
      };
    };
    const first = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [post("30", "2026-09-02T08:05:00Z", bulletin("07", skikda2, twoFires))],
        store,
        flaky,
      ),
    );
    expect(first).toMatchObject({ llmFailed: 1, mentions: 0 });
    expect(retry.size).toBe(1);

    const second = await runTextSourceWith(
      "dgpc_telegram",
      deps([], store, flaky),
    );
    expect(second).toMatchObject({ retried: 1, llmFailed: 0, mentions: 2 });
    expect(retry.size).toBe(0);
    expect(mentions.map((m) => m["commune_id"])).toEqual([AZZABA, AIN_ZOUIT]);
  });

  it("keeps the retry marker when inserting the retried mentions fails", async () => {
    const { store, retry } = memoryStore();
    await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [post("50", "2026-09-02T08:05:00Z", bulletin("07", skikda2, twoFires))],
        store,
        async () => {
          throw new Error("openrouter 502");
        },
      ),
    );
    expect(retry.size).toBe(1);
    const failing: TextSourceStore = {
      ...store,
      insertMentions: async () => {
        throw new Error("insert failed");
      },
    };
    await expect(
      runTextSourceWith(
        "dgpc_telegram",
        deps([], failing, llmWith(mention({}))),
      ),
    ).rejects.toThrow("insert failed");
    expect(retry.size).toBe(1);
  });

  it("does not re-apply an old bulletin's coverage when it is retried", async () => {
    const { store, retry } = memoryStore();
    const failing: TextSourcePipelineDependencies["extractLlm"] = async () => {
      throw new Error("openrouter 502");
    };
    await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [post("40", "2026-09-02T08:05:00Z", bulletin("07", skikda2, twoFires))],
        store,
        failing,
      ),
    );
    expect(retry.size).toBe(1);
    const again = await runTextSourceWith(
      "dgpc_telegram",
      deps([], store, failing),
    );
    expect(again.incidentsUnlisted).toBe(0);
  });

  it("marks a document for retry when its commune fails gazetteer resolution, and clears it once an alias lets a later pass resolve the same name", async () => {
    const { store, mentions, retry } = memoryStore();
    let calls = 0;
    const improving: TextSourcePipelineDependencies["extractLlm"] =
      async () => {
        calls += 1;
        return {
          skipped: false,
          mentions: [
            mention({ commune: calls === 1 ? "قرية مجهولة" : "عين زويت" }),
          ],
        };
      };
    const first = await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [
          post(
            "60",
            "2026-09-02T08:05:00Z",
            bulletin("07", "⏮️⏮️ ولاية سكيكدة 01", twoFires),
          ),
        ],
        store,
        improving,
      ),
    );
    expect(first).toMatchObject({ unresolved: 1, llmFailed: 0 });
    expect(retry.size).toBe(1);

    const second = await runTextSourceWith(
      "dgpc_telegram",
      deps([], store, improving),
    );
    expect(second).toMatchObject({ retried: 1, mentions: 1, unresolved: 0 });
    expect(retry.size).toBe(0);
    expect(mentions.some((m) => m["commune_id"] === AIN_ZOUIT)).toBe(true);
  });

  it("does not mark a fully-resolved document for retry", async () => {
    const { store, retry } = memoryStore();
    await runTextSourceWith(
      "dgpc_telegram",
      deps(
        [post("61", "2026-09-02T08:05:00Z", bulletin("07", skikda2, twoFires))],
        store,
        llmWith(mention({}), mention({ commune: "عين زويت" })),
      ),
    );
    expect(retry.size).toBe(0);
  });
});
