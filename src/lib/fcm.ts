export const FCM_LANGS = ["ar", "fr", "en", "kab"] as const;
export type FcmLang = (typeof FCM_LANGS)[number];

const APP_URL = "https://nadhir.app";

export function fcmTopic(code: string, lang: string): string {
  return `v1.commune.${code}.${lang}`;
}

export type FcmMessage = {
  topic: string;
  notification: { title: string; body: string };
  webpush: { fcm_options: { link: string } };
  data: { broadcast_id: string; severity: string; kind: string };
};

function message(
  topic: string,
  title: string,
  body: string,
  link: string,
  data: FcmMessage["data"],
): FcmMessage {
  return {
    topic,
    notification: { title, body },
    webpush: { fcm_options: { link } },
    data,
  };
}

export function fcmMessagesForFire(args: {
  broadcastId: string;
  severity: string;
  communeCodes: string[];
  shortId: string;
  info: { language: string; headline: string; description: string }[];
}): FcmMessage[] {
  const link = `${APP_URL}/fire/${args.shortId}`;
  const data = {
    broadcast_id: args.broadcastId,
    severity: args.severity,
    kind: "fire",
  };
  const out: FcmMessage[] = [];
  for (const code of args.communeCodes)
    for (const lang of FCM_LANGS) {
      const block = args.info.find((i) => i.language.split("-")[0] === lang);
      if (!block) continue;
      out.push(
        message(
          fcmTopic(code, lang),
          block.headline,
          block.description,
          link,
          data,
        ),
      );
    }
  return out;
}

export function fcmMessagesForOnm(args: {
  broadcastId: string;
  severity: string;
  communeCodes: string[];
  title: string;
  headlineFr: string | null;
}): FcmMessage[] {
  const data = {
    broadcast_id: args.broadcastId,
    severity: args.severity,
    kind: "onm",
  };
  // relayed verbatim: same authority text on every language topic, attributed
  const body = args.headlineFr ?? args.title;
  const out: FcmMessage[] = [];
  for (const code of args.communeCodes)
    for (const lang of FCM_LANGS)
      out.push(
        message(
          fcmTopic(code, lang),
          "ONM · Météo Algérie",
          body,
          `${APP_URL}/forecast`,
          data,
        ),
      );
  return out;
}

export function fcmMessagesForAuthority(args: {
  broadcastId: string;
  severity: string;
  communeCodes: string[];
  source: string;
  body: string;
}): FcmMessage[] {
  const data = {
    broadcast_id: args.broadcastId,
    severity: args.severity,
    kind: "authority",
  };
  const out: FcmMessage[] = [];
  for (const code of args.communeCodes)
    for (const lang of FCM_LANGS)
      out.push(
        message(fcmTopic(code, lang), args.source, args.body, APP_URL, data),
      );
  return out;
}
