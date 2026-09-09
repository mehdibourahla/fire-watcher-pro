import { describe, expect, it } from "vitest";
import {
  archiveExportOptions,
  archivePayloadName,
} from "../source-archive-export";

const args = [
  "--from",
  "2026-09-01T00:00:00Z",
  "--to",
  "2026-10-01T00:00:00Z",
  "--out",
  "./export",
];
describe("archive export boundaries", () => {
  it("uses explicit UTC boundaries and an exclusive end", () => {
    expect(archiveExportOptions([...args, "--source", "ita_website"])).toEqual({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z",
      out: "./export",
      source: "ita_website",
    });
  });
  it.each([
    "2026-02-30T00:00:00Z",
    "2026-09-01",
    "2026-09-01T00:00:00-04:00",
    "garbage",
  ])("rejects ambiguous or invalid time %s", (value) => {
    expect(() =>
      archiveExportOptions(["--from", value, ...args.slice(2)]),
    ).toThrow();
  });
  it("rejects reversed ranges and duplicate or unknown flags", () => {
    expect(() =>
      archiveExportOptions([
        "--from",
        "2027-01-01T00:00:00Z",
        ...args.slice(2),
      ]),
    ).toThrow("precede");
    expect(() =>
      archiveExportOptions([...args, "--out", "overwrite"]),
    ).toThrow();
    expect(() =>
      archiveExportOptions([...args, "--token", "secret"]),
    ).toThrow();
  });
  it("never derives local payload paths from upstream paths", () => {
    expect(archivePayloadName("a".repeat(64))).toBe(`${"a".repeat(64)}.bin`);
    expect(() => archivePayloadName("../../outside")).toThrow();
  });
});
