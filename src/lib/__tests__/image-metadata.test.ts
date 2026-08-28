import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { stripImageMetadata } from "@/lib/image-metadata";

function segment(marker: number, body: number[]): number[] {
  const len = body.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...body];
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

function jpegWithExif(): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xe1, ascii("Exif\0\0GPS 36.7N 3.0E home address")),
    ...segment(0xfe, ascii("a comment naming the photographer")),
    ...segment(0xdb, [0x00, 0x01, 0x02]),
    ...segment(0xda, [0x00, 0x01]),
    0x12,
    0x34,
    0xff,
    0xd9,
  ]);
}

function chunk(type: string, data: number[]): number[] {
  const len = data.length;
  return [
    (len >> 24) & 0xff,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
    ...ascii(type),
    ...data,
    0,
    0,
    0,
    0,
  ];
}

function pngWithExif(): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk("IHDR", new Array(13).fill(1)),
    ...chunk("eXIf", ascii("GPS 36.7N 3.0E home address")),
    ...chunk("tEXt", ascii("Author\0the photographer")),
    ...chunk("IDAT", [9, 9, 9]),
    ...chunk("IEND", []),
  ]);
}

const text = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

describe("stripImageMetadata", () => {
  it("removes Exif and comments from a JPEG but keeps the image", () => {
    const out = stripImageMetadata(jpegWithExif(), "image/jpeg");

    expect(text(out)).not.toContain("home address");
    expect(text(out)).not.toContain("photographer");
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(text(out.slice(-2))).toBe(text(new Uint8Array([0xff, 0xd9])));
    expect([...out]).toContain(0xda);
  });

  it("removes Exif and text chunks from a PNG but keeps the image", () => {
    const out = stripImageMetadata(pngWithExif(), "image/png");

    expect(text(out)).not.toContain("home address");
    expect(text(out)).not.toContain("photographer");
    expect(text(out)).toContain("IHDR");
    expect(text(out)).toContain("IDAT");
    expect(text(out)).toContain("IEND");
  });

  it("refuses a format it cannot sanitise", () => {
    expect(() =>
      stripImageMetadata(new Uint8Array([0x47, 0x49]), "image/gif"),
    ).toThrow("unsupported_type");
  });

  it("refuses bytes whose signature contradicts the declared type", () => {
    expect(() => stripImageMetadata(pngWithExif(), "image/jpeg")).toThrow(
      "unsupported_type",
    );
  });
});

describe("report photo upload", () => {
  it("sanitises the photo instead of uploading the file it was given", () => {
    const src = readFileSync("src/lib/reports.ts", "utf8");
    const fn =
      /export async function uploadReportPhoto[\s\S]*?\n}/.exec(src)?.[0] ?? "";

    expect(fn).toMatch(/stripImageMetadata/);
    expect(fn).not.toMatch(/\.upload\(\s*path,\s*file\b/);
  });
});
