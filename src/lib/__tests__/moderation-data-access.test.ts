import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}));

import {
  ideaQueueQuery,
  moderateIdea,
  publishedIdeasQuery,
} from "@/lib/contribute";
import { moderateSuggestion, suggestionQueueQuery } from "@/lib/translate";

type Result = { data: unknown; error: { message: string } | null };

function query(result: Result) {
  const builder: Record<string, ReturnType<typeof vi.fn> | unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "update"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder["then"] = (resolve: (value: Result) => unknown) =>
    Promise.resolve(result).then(resolve);
  return builder;
}

async function runQuery(option: { queryFn?: unknown }) {
  return (option.queryFn as () => Promise<unknown>)();
}

describe("contribution idea data boundaries", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
  });

  it("reads the public board only through the safe projection", async () => {
    const builder = query({
      data: [
        {
          id: "idea-1",
          lane: "local",
          message: "A published idea",
          score: 4,
          published_at: "2026-08-31T20:00:00Z",
        },
      ],
      error: null,
    });
    fromMock.mockReturnValue(builder);

    await expect(runQuery(publishedIdeasQuery)).resolves.toHaveLength(1);
    expect(fromMock).toHaveBeenCalledWith("published_contribution_ideas");
    expect(builder["select"]).toHaveBeenCalledWith(
      "id, lane, message, score, published_at",
    );
    expect(builder["eq"]).not.toHaveBeenCalled();
  });

  it("surfaces a safe-projection read failure instead of falling back to the private table", async () => {
    fromMock.mockImplementation((relation: string) =>
      query(
        relation === "published_contribution_ideas"
          ? { data: null, error: { message: "safe view unavailable" } }
          : { data: [], error: null },
      ),
    );

    await expect(runQuery(publishedIdeasQuery)).rejects.toThrow(
      "safe view unavailable",
    );
  });

  it("loads the private moderator queue through its role-checking RPC", async () => {
    rpcMock.mockResolvedValue({ data: [{ id: "idea-1" }], error: null });
    fromMock.mockReturnValue(query({ data: [], error: null }));

    await expect(runQuery(ideaQueueQuery)).resolves.toEqual([{ id: "idea-1" }]);
    expect(rpcMock).toHaveBeenCalledWith(
      "list_contribution_ideas_for_moderation",
    );
    expect(fromMock).not.toHaveBeenCalledWith("contribution_ideas");
  });

  it("propagates private queue authorization failures", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "moderation_role_required" },
    });
    fromMock.mockReturnValue(query({ data: [], error: null }));

    await expect(runQuery(ideaQueueQuery)).rejects.toThrow(
      "moderation_role_required",
    );
  });

  it("sends idea decisions through the actor-attributing RPC", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValue(query({ data: null, error: null }));

    await moderateIdea("idea-1", "published", "reviewed");

    expect(rpcMock).toHaveBeenCalledWith("moderate_contribution_idea", {
      _idea: "idea-1",
      _status: "published",
      _moderation_note: "reviewed",
    });
    expect(fromMock).not.toHaveBeenCalledWith("contribution_ideas");
  });

  it("propagates idea moderation RPC failures", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "moderation_role_required" },
    });
    fromMock.mockReturnValue(query({ data: null, error: null }));

    await expect(moderateIdea("idea-1", "rejected")).rejects.toThrow(
      "moderation_role_required",
    );
  });
});

describe("translation moderation data boundaries", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
  });

  it("loads the private translation queue through its role-checking RPC", async () => {
    rpcMock.mockResolvedValue({ data: [{ id: "suggestion-1" }], error: null });
    fromMock.mockReturnValue(query({ data: [], error: null }));

    await expect(runQuery(suggestionQueueQuery)).resolves.toEqual([
      { id: "suggestion-1" },
    ]);
    expect(rpcMock).toHaveBeenCalledWith(
      "list_translation_suggestions_for_moderation",
    );
    expect(fromMock).not.toHaveBeenCalledWith("translation_suggestions");
  });

  it("propagates translation queue authorization failures", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "moderation_role_required" },
    });
    fromMock.mockReturnValue(query({ data: [], error: null }));

    await expect(runQuery(suggestionQueueQuery)).rejects.toThrow(
      "moderation_role_required",
    );
  });

  it("sends translation decisions through the actor-attributing RPC", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValue(query({ data: null, error: null }));

    await moderateSuggestion("suggestion-1", "accepted");

    expect(rpcMock).toHaveBeenCalledWith("moderate_translation_suggestion", {
      _suggestion: "suggestion-1",
      _status: "accepted",
    });
    expect(fromMock).not.toHaveBeenCalledWith("translation_suggestions");
  });

  it("propagates translation moderation RPC failures", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "moderation_role_required" },
    });
    fromMock.mockReturnValue(query({ data: null, error: null }));

    await expect(
      moderateSuggestion("suggestion-1", "rejected"),
    ).rejects.toThrow("moderation_role_required");
  });
});
