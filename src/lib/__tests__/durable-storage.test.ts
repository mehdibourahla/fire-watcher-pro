import { expect, it, vi } from "vitest";

import {
  createMirror,
  restoreMirror,
  type MirrorFs,
} from "@/lib/durable-storage";

function memoryFs(fail = false): MirrorFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    write: async (key, value) => {
      if (fail) throw new Error("disk");
      files.set(key, value);
    },
    remove: async (key) => void files.delete(key),
    readAll: async () => Object.fromEntries(files),
  };
}

it("mirrors nadhir.* writes and removals in order, ignores other keys", async () => {
  const fs = memoryFs();
  const mirror = createMirror(fs);
  mirror.set("nadhir.survival.pack", "{}");
  mirror.set("sb-x-auth-token", "secret");
  await mirror.flush();
  expect([...fs.files.keys()]).toEqual(["nadhir.survival.pack"]);
  mirror.set("nadhir.survival.pack", '{"v":2}');
  mirror.remove("nadhir.survival.pack");
  await mirror.flush();
  expect(fs.files.size).toBe(0);
});

it("flush rejects once when a mirror write failed", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const mirror = createMirror(memoryFs(true));
  mirror.set("nadhir.survival.pack", "{}");
  await expect(mirror.flush()).rejects.toThrow("disk");
  await expect(mirror.flush()).resolves.toBeUndefined();
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});

it("restores only mirrored keys missing from storage", async () => {
  const fs = memoryFs();
  fs.files.set("nadhir.survival.pack", "old");
  fs.files.set("nadhir.locale", "fr");
  fs.files.set("other", "x");
  const m = new Map([["nadhir.locale", "ar"]]);
  const storage = {
    getItem: (key: string) => m.get(key) ?? null,
    setItem: (key: string, value: string) => void m.set(key, value),
  };
  expect(await restoreMirror(storage, fs)).toBe(1);
  expect(m.get("nadhir.survival.pack")).toBe("old");
  expect(m.get("nadhir.locale")).toBe("ar");
  expect(m.has("other")).toBe(false);
});
