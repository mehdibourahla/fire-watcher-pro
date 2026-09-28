import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { resolveCommune, type CommuneAsset } from "@/lib/commune-resolver";

const square = (x: number, y: number, size: number) => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];

const asset: CommuneAsset = {
  v: 1,
  communes: [
    { c: "0001", b: [0, 0, 10, 10], p: [[square(0, 0, 10), square(4, 4, 2)]] },
    { c: "0002", b: [4, 4, 6, 6], p: [[square(4, 4, 2)]] },
    {
      c: "0003",
      b: [20, 0, 32, 2],
      p: [[square(20, 0, 2)], [square(30, 0, 2)]],
    },
  ],
};

it("finds the commune whose outline contains the point", () => {
  expect(resolveCommune(asset, 1, 1)).toBe("0001");
  expect(resolveCommune(asset, 31, 1)).toBe("0003");
});

it("treats an inner ring as a hole, so the enclave wins", () => {
  expect(resolveCommune(asset, 5, 5)).toBe("0002");
});

it("returns null outside every commune, never a guess", () => {
  expect(resolveCommune(asset, 25, 1)).toBeNull();
  expect(resolveCommune(asset, -5, -5)).toBeNull();
});

it("agrees with the full outlines on every fixture point of the shipped asset", () => {
  const shipped = JSON.parse(
    readFileSync("public/geo/communes.v1.json", "utf8"),
  ) as CommuneAsset;
  const fixture = JSON.parse(
    readFileSync("data/geo/commune-fixture.json", "utf8"),
  ) as { lon: number; lat: number; code: string | null }[];
  expect(shipped.communes).toHaveLength(1536);
  for (const point of fixture)
    expect(resolveCommune(shipped, point.lon, point.lat)).toBe(point.code);
});
