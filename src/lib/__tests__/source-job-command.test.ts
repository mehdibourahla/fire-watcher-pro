import { describe, expect, it } from "vitest";

import { sourceJobCommandExitCode } from "@/lib/source-job-command";

describe("sourceJobCommandExitCode", () => {
  it("distinguishes a drained queue from one completed job", () => {
    expect(sourceJobCommandExitCode({ claimed: false, pending: false })).toBe(
      0,
    );
    expect(
      sourceJobCommandExitCode({
        claimed: true,
        contract: "local_fwi",
        state: "succeeded",
      }),
    ).toBe(76);
  });

  it("keeps polling while a future retry remains pending", () => {
    expect(sourceJobCommandExitCode({ claimed: false, pending: true })).toBe(
      75,
    );
  });

  it("keeps retry waiting distinct from terminal failure", () => {
    expect(
      sourceJobCommandExitCode({
        claimed: true,
        contract: "effis",
        state: "retry_wait",
      }),
    ).toBe(75);
    expect(
      sourceJobCommandExitCode({
        claimed: true,
        contract: "effis",
        state: "failed",
      }),
    ).toBe(1);
  });
});
