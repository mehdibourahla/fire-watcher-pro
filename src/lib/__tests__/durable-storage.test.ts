import { expect, it, vi } from "vitest";

import {
  createMirror,
  patchStorage,
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

it("flush rejects for a key whose last write failed, until it is rewritten", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const fs = memoryFs();
  const mirror = createMirror(fs);
  const write = fs.write;
  fs.write = async (key, value) => {
    if (key === "nadhir.theme") throw new Error("disk");
    return write(key, value);
  };
  mirror.set("nadhir.theme", "dark");
  mirror.set("nadhir.survival.pack", "{}");
  await expect(mirror.flush("nadhir.survival.pack")).resolves.toBeUndefined();
  await expect(mirror.flush("nadhir.theme")).rejects.toThrow("disk");
  fs.write = write;
  mirror.set("nadhir.theme", "light");
  await expect(mirror.flush("nadhir.theme")).resolves.toBeUndefined();
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});

it("patches only writes to the target storage, once", async () => {
  class FakeStorage {
    items = new Map<string, string>();
    setItem(key: string, value: string) {
      this.items.set(key, value);
    }
    removeItem(key: string) {
      this.items.delete(key);
    }
  }
  const local = new FakeStorage();
  const session = new FakeStorage();
  const fs = memoryFs();
  const mirror = createMirror(fs);
  patchStorage(FakeStorage.prototype, local, mirror);
  patchStorage(FakeStorage.prototype, local, mirror);
  local.setItem("nadhir.locale", "fr");
  session.setItem("nadhir.survival.active", "1");
  await mirror.flush("nadhir.locale");
  expect(local.items.get("nadhir.locale")).toBe("fr");
  expect(session.items.get("nadhir.survival.active")).toBe("1");
  expect([...fs.files.keys()]).toEqual(["nadhir.locale"]);
  local.removeItem("nadhir.locale");
  await mirror.flush("nadhir.locale");
  expect(fs.files.size).toBe(0);
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
