import { NATIVE } from "@/lib/platform";

export type MirrorFs = {
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  readAll(): Promise<Record<string, string>>;
};

const MIRRORED = /^nadhir\./;

export function createMirror(fs: MirrorFs) {
  let pending: Promise<void> = Promise.resolve();
  let failure: unknown = null;
  const queue = (op: () => Promise<void>) => {
    pending = pending.then(op).catch((error: unknown) => {
      failure ??= error;
      console.error("durable storage write failed", error);
    });
  };
  return {
    set(key: string, value: string) {
      if (MIRRORED.test(key)) queue(() => fs.write(key, value));
    },
    remove(key: string) {
      if (MIRRORED.test(key)) queue(() => fs.remove(key));
    },
    async flush() {
      await pending;
      if (failure === null) return;
      const error = failure;
      failure = null;
      throw error;
    },
  };
}

export async function restoreMirror(
  storage: Pick<Storage, "getItem" | "setItem">,
  fs: MirrorFs,
) {
  let restored = 0;
  for (const [key, value] of Object.entries(await fs.readAll())) {
    if (!MIRRORED.test(key) || storage.getItem(key) !== null) continue;
    storage.setItem(key, value);
    restored += 1;
  }
  return restored;
}

async function capacitorMirrorFs(): Promise<MirrorFs> {
  const { Directory, Encoding, Filesystem } =
    await import("@capacitor/filesystem");
  const directory = Directory.Data;
  const folder = "storage";
  const path = (key: string) => `${folder}/${encodeURIComponent(key)}`;
  const exists = (target: string) =>
    Filesystem.stat({ path: target, directory }).then(
      () => true,
      () => false,
    );
  return {
    async write(key, value) {
      await Filesystem.writeFile({
        path: path(key),
        directory,
        data: value,
        encoding: Encoding.UTF8,
        recursive: true,
      });
    },
    async remove(key) {
      try {
        await Filesystem.deleteFile({ path: path(key), directory });
      } catch (error) {
        if (await exists(path(key))) throw error;
      }
    },
    async readAll() {
      let names: string[];
      try {
        names = (
          await Filesystem.readdir({ path: folder, directory })
        ).files.map((file) => file.name);
      } catch (error) {
        if (await exists(folder)) throw error;
        return {};
      }
      const entries: Record<string, string> = {};
      for (const name of names) {
        const { data } = await Filesystem.readFile({
          path: `${folder}/${name}`,
          directory,
          encoding: Encoding.UTF8,
        });
        entries[decodeURIComponent(name)] = String(data);
      }
      return entries;
    },
  };
}

let mirror: ReturnType<typeof createMirror> | null = null;
let starting: Promise<void> | null = null;

export function startDurableStorage() {
  if (!NATIVE) return Promise.resolve();
  starting ??= installDurableStorage();
  return starting;
}

async function installDurableStorage() {
  const fs = await capacitorMirrorFs();
  await restoreMirror(window.localStorage, fs);
  const active = createMirror(fs);
  mirror = active;
  const { setItem, removeItem } = Storage.prototype;
  // an own property on a Storage instance would be stored as an item, so patch the prototype
  Storage.prototype.setItem = function (key: string, value: string) {
    setItem.call(this, key, value);
    if (this === window.localStorage) active.set(key, String(value));
  };
  Storage.prototype.removeItem = function (key: string) {
    removeItem.call(this, key);
    if (this === window.localStorage) active.remove(key);
  };
}

export async function flushDurableStorage() {
  await mirror?.flush();
}
