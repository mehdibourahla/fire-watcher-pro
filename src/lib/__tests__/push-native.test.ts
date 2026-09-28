import { afterEach, beforeEach, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getToken: vi.fn(),
  subscribeToTopic: vi.fn(),
  unsubscribeFromTopic: vi.fn(),
  addListener: vi.fn(),
  createChannel: vi.fn(),
}));
const platform = vi.hoisted(() => ({ name: "ios" }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => platform.name },
}));
const follow = vi.hoisted(() => ({ status: vi.fn(), setPinned: vi.fn() }));
vi.mock("@/lib/current-commune", () => ({ CurrentCommune: follow }));
const local = vi.hoisted(() => ({ addListener: vi.fn(), schedule: vi.fn() }));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: local,
}));
vi.mock("@capacitor-firebase/messaging", () => ({
  FirebaseMessaging: plugin,
}));
const session = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: session },
}));

import { appLink, nativeTransport, startNativePush } from "@/lib/push-native";
import {
  setUserPush,
  subscribeToCommunes,
  unsubscribeAll,
  type PushTransport,
} from "@/lib/push";

const store = new Map<string, string>();

beforeEach(() => {
  vi.resetAllMocks();
  platform.name = "ios";
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ok: true })),
  );
});

afterEach(() => vi.unstubAllGlobals());

function fakeTransport(): PushTransport & {
  joined: string[][];
  left: string[][];
  settledWith: [string[], string][];
} {
  const joined: string[][] = [];
  const left: string[][] = [];
  const settledWith: [string[], string][] = [];
  return {
    joined,
    left,
    settledWith,
    settled: async (communes, lang) => void settledWith.push([communes, lang]),
    permission: async () => "granted",
    request: async () => true,
    token: async () => "native-token",
    topics: async (communes, lang, join) =>
      void (join ? joined : left).push(communes.map((c) => `${c}.${lang}`)),
  };
}

it("joins and leaves commune topics through the device SDK", async () => {
  await nativeTransport.topics(["1503", "1510"], "ar", true);
  expect(plugin.subscribeToTopic.mock.calls).toEqual([
    [{ topic: "v1.commune.1503.ar" }],
    [{ topic: "v1.commune.1510.ar" }],
  ]);
  await nativeTransport.topics(["1503"], "fr", false);
  expect(plugin.unsubscribeFromTopic).toHaveBeenCalledWith({
    topic: "v1.commune.1503.fr",
  });
});

it("maps the plugin permission states", async () => {
  plugin.checkPermissions.mockResolvedValue({
    receive: "prompt-with-rationale",
  });
  expect(await nativeTransport.permission()).toBe("prompt");
  plugin.checkPermissions.mockResolvedValue({ receive: "denied" });
  expect(await nativeTransport.permission()).toBe("denied");
});

it("changing communes joins the new ones and leaves the stale language, without the server", async () => {
  const transport = fakeTransport();
  store.set(
    "nadhir.push.v1",
    JSON.stringify({ communes: ["1503"], lang: "fr" }),
  );
  await subscribeToCommunes(["1503", "1510"], "ar", transport);
  expect(transport.joined).toEqual([["1503.ar", "1510.ar"]]);
  expect(transport.left).toEqual([["1503.fr"]]);
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.parse(store.get("nadhir.push.v1")!)).toEqual({
    communes: ["1503", "1510"],
    lang: "ar",
  });
});

it("registers the device token on the signed-in user's topic through the server", async () => {
  session.getSession.mockResolvedValue({
    data: { session: { access_token: "jwt" } },
    error: null,
  });
  await setUserPush(true, fakeTransport());
  const [url, init] = vi.mocked(fetch).mock.calls[0]!;
  expect(String(url)).toContain("/api/private/user-push");
  expect(JSON.parse(String(init!.body))).toEqual({
    token: "native-token",
    action: "subscribe",
  });
  expect(store.get("nadhir.userpush.v1")).toBe("on");
});

it("follows only same-app paths from a notification", () => {
  expect(appLink({ link: "/fire/DZ1" })).toBe("/fire/DZ1");
  expect(appLink({ link: "/forecast?commune=1503" })).toBe(
    "/forecast?commune=1503",
  );
  expect(appLink({ link: "https://evil.example" })).toBeNull();
  expect(appLink({ link: "//evil.example" })).toBeNull();
  expect(appLink({ link: "/\\evil.example" })).toBeNull();
  expect(appLink({ link: 3 })).toBeNull();
  expect(appLink(undefined)).toBeNull();
});

it("registers notification listeners once however often it starts", async () => {
  const options = { channelName: "x", navigate: vi.fn(), onToken: vi.fn() };
  await startNativePush(options);
  await startNativePush({ ...options, channelName: "y" });
  const events = plugin.addListener.mock.calls.map(([name]) => name);
  expect(events).toEqual(["notificationActionPerformed", "tokenReceived"]);
  const tap = plugin.addListener.mock.calls[0]![1] as (e: unknown) => void;
  tap({ notification: { data: { link: "/fire/DZ1" } } });
  expect(options.navigate).toHaveBeenCalledExactlyOnceWith("/fire/DZ1");
});

it("shows an Android foreground push immediately, without asking for alarm permission", async () => {
  vi.resetModules();
  platform.name = "android";
  const fresh = await import("@/lib/push-native");
  await fresh.startNativePush({
    channelName: "Nadhir alerts",
    navigate: vi.fn(),
    onToken: vi.fn(),
  });
  const received = plugin.addListener.mock.calls.find(
    ([name]) => name === "notificationReceived",
  )![1] as (e: unknown) => void;
  received({
    notification: { title: "t", body: "b", data: { link: "/fire/DZ1" } },
  });
  received({
    notification: {
      title: "t2",
      body: "b2",
      tag: "fire-DZ1",
      data: { link: "/fire/DZ1" },
    },
  });
  received({
    notification: {
      title: "t3",
      body: "b3",
      tag: "fire-DZ1",
      data: { link: "/fire/DZ1" },
    },
  });
  const ids = local.schedule.mock.calls.map(([arg]) => arg.notifications[0].id);
  expect(ids[1]).toBe(ids[2]);
  const [notification] = local.schedule.mock.calls[0]![0].notifications;
  expect(notification).toMatchObject({
    title: "t",
    body: "b",
    channelId: "alerts",
    isExactNotification: false,
    extra: { link: "/fire/DZ1" },
  });
  expect(plugin.createChannel).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "alerts",
      name: "Nadhir alerts",
      importance: 5,
    }),
  );
});

it("tells the location tracker which communes are now manual after every change", async () => {
  const transport = fakeTransport();
  await subscribeToCommunes(["1503"], "ar", transport);
  await unsubscribeAll(transport);
  expect(transport.settledWith).toEqual([
    [["1503"], "ar"],
    [[], "ar"],
  ]);
});

it("pins manual communes only while the tracker is on", async () => {
  follow.status.mockResolvedValue({ enabled: false });
  await nativeTransport.settled!(["1503"], "ar");
  expect(follow.setPinned).not.toHaveBeenCalled();
  follow.status.mockResolvedValue({ enabled: true });
  await nativeTransport.settled!(["1503"], "fr");
  expect(follow.setPinned).toHaveBeenCalledWith({
    pinned: ["1503"],
    lang: "fr",
  });
});
