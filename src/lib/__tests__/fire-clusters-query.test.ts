import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === "__tests__" || name === "integrations" ? [] : files(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".server.ts") ? [path] : [];
  });

// visitors may not read who closed a fire, so PostgREST refuses select=* on this table
it("never asks for every fire_clusters column from the browser", () => {
  const offenders = files(join(__dirname, "..", "..")).filter((path) => {
    const src = readFileSync(path, "utf8").replace(/\s+/g, " ");
    return (
      /from\("fire_clusters"\)\s*\.select\("\*"\)/.test(src) ||
      /fire_clusters\(\*\)/.test(src)
    );
  });
  expect(offenders).toEqual([]);
});
