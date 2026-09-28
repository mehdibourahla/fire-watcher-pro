import { NATIVE } from "@/lib/platform";

export type MirrorFs = {
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  readAll(): Promise<Record<string, string>>;
};

const MIRRORED = /^nadhir\./;

export type Mirror = ReturnType<typeof createMirror>;

export function createMirror(fs: MirrorFs) {
  let pending: Promise<void> = Promise.resolve();
  const failures = new Map<string, unknown>();
  const queue = (key: string, op: () => Promise<void>) => {
    if (!MIRRORED.test(key)) return;
    pending = pending.then(op).then(
      () => void failures.delete(key),
      (error: unknown) => {
        failures.set(key, error);
        console.error("durable storage write failed", key, error);
      },
    );
  };
  return {
    set(key: string, value: string) {
      queue(key, () => fs.write(key, value));
    },
    remove(key: string) {
      queue(key, () => fs.remove(key));
    },
    async flush(key?: string) {
      await pending;
      const failure = key ? failures.get(key) : failures.values().next().value;
      if (failure !== undefined) throw failure;
    },
  };
}

const patched = new WeakSet<object>();

export function patchStorage(
  proto: Pick<Storage, "setItem" | "removeItem">,
  target: object,
  mirror: Pick<Mirror, "set" | "remove">,
) {
  if (patched.has(proto)) return;
  patched.add(proto);
  const { setItem, removeItem } = proto;
  // an own property on a Storage instance would be stored as an item, so patch the prototype
  proto.setItem = function (this: object, key: string, value: string) {
    setItem.call(this, key, value);
    if (this === target) mirror.set(key, String(value));
  };
  proto.removeItem = function (this: object, key: string) {
    removeItem.call(this, key);
    if (this === target) mirror.remove(key);
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

let mirror: Mirror | null = null;
let starting: Promise<void> | null = null;

export function startDurableStorage() {
  if (!NATIVE) return Promise.resolve();
  starting ??= installDurableStorage();
  return starting;
}

async function installDurableStorage() {
  const fs = await capacitorMirrorFs();
  await restoreMirror(window.localStorage, fs);
  mirror = createMirror(fs);
  patchStorage(Storage.prototype, window.localStorage, mirror);
}

export async function flushDurableStorage(key?: string) {
  await startDurableStorage();
  await mirror?.flush(key);
}
