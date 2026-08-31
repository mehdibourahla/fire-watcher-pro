export type CapUrgency = "Immediate" | "Expected" | "Future" | "Past";
export type CapSeverity = "Extreme" | "Severe" | "Moderate" | "Minor";
export type CapCertainty = "Observed" | "Likely" | "Possible" | "Unlikely";

export type CapInfo = {
  language: string;
  category: "Fire";
  event: string;
  urgency: CapUrgency;
  severity: CapSeverity;
  certainty: CapCertainty;
  effective: string;
  expires: string;
  headline: string;
  description: string;
  instruction: string;
  areaDesc: string;
  circle: string;
};

export type CapAlert = {
  identifier: string;
  sender: string;
  sent: string;
  status: "Actual";
  msgType: "Alert" | "Update" | "Cancel";
  scope: "Public";
  references?: string;
  info: CapInfo[];
};

export type CapText = {
  language: string;
  event: string;
  headline: string;
  description: string;
  instruction: string;
};

export type FireCapInput = {
  shortId: string;
  lat: number;
  lon: number;
  radiusKm: number;
  confidence: number;
  urgent: boolean;
  areaDesc: string;
  sentAt: Date;
  texts: CapText[];
};

export const CAP_SENDER = "alerts@nadhir.app";
const VALID_FOR_MINUTES = 180;
const OBSERVED_CONFIDENCE = 0.8;

/** CAP 1.2 forbids the "Z" designator; Algeria is UTC+01:00 all year. */
function capDateTime(date: Date): string {
  const local = new Date(date.getTime() + 3600_000);
  return `${local.toISOString().slice(0, 19)}+01:00`;
}

export function fireCapIdentifier(shortId: string, urgent: boolean): string {
  return `nadhir-fire-${shortId}-${urgent ? "urgent" : "new"}`;
}

export function buildFireCap(input: FireCapInput): CapAlert {
  const effective = capDateTime(input.sentAt);
  const expires = capDateTime(
    new Date(input.sentAt.getTime() + VALID_FOR_MINUTES * 60_000),
  );

  return {
    identifier: fireCapIdentifier(input.shortId, input.urgent),
    sender: CAP_SENDER,
    sent: effective,
    status: "Actual",
    msgType: "Alert",
    scope: "Public",
    info: input.texts.map((text) => ({
      language: text.language,
      category: "Fire",
      event: text.event,
      urgency: input.urgent ? "Immediate" : "Expected",
      severity: input.urgent ? "Extreme" : "Severe",
      certainty:
        input.confidence >= OBSERVED_CONFIDENCE ? "Observed" : "Likely",
      effective,
      expires,
      headline: text.headline,
      description: text.description,
      instruction: text.instruction,
      areaDesc: input.areaDesc,
      circle: `${input.lat},${input.lon} ${input.radiusKm}`,
    })),
  };
}

export type BroadcastPhase = "initial" | "update" | "end" | "cancel";

export type BroadcastCapInput = {
  shortId: string;
  seq: number;
  phase: BroadcastPhase;
  lat: number;
  lon: number;
  severity: "Extreme" | "Severe";
  confidence: number;
  areaDesc: string;
  sentAt: Date;
  texts: CapText[];
  references: { identifier: string; sent: string }[];
};

export const BROADCAST_RING_KM = 15;
const CLOSED_VALID_FOR_MINUTES = 24 * 60;

export function broadcastCapIdentifier(shortId: string, seq: number): string {
  return `nadhir-brd-${shortId}-${seq}`;
}

const BROADCAST_MSG_TYPE: Record<BroadcastPhase, CapAlert["msgType"]> = {
  initial: "Alert",
  update: "Update",
  end: "Update",
  cancel: "Cancel",
};

export function buildBroadcastCap(input: BroadcastCapInput): CapAlert {
  const closed = input.phase === "end" || input.phase === "cancel";
  const effective = capDateTime(input.sentAt);
  const expires = capDateTime(
    new Date(
      input.sentAt.getTime() +
        (closed ? CLOSED_VALID_FOR_MINUTES : VALID_FOR_MINUTES) * 60_000,
    ),
  );

  const urgency: CapUrgency = closed
    ? "Past"
    : input.severity === "Extreme"
      ? "Immediate"
      : "Expected";
  const certainty: CapCertainty =
    input.phase === "cancel"
      ? "Unlikely"
      : input.phase === "end"
        ? "Possible"
        : input.confidence >= OBSERVED_CONFIDENCE
          ? "Observed"
          : "Likely";

  return {
    identifier: broadcastCapIdentifier(input.shortId, input.seq),
    sender: CAP_SENDER,
    sent: effective,
    status: "Actual",
    msgType: BROADCAST_MSG_TYPE[input.phase],
    scope: "Public",
    ...(input.references.length
      ? {
          references: input.references
            .map((r) => `${CAP_SENDER},${r.identifier},${r.sent}`)
            .join(" "),
        }
      : {}),
    info: input.texts.map((text) => ({
      language: text.language,
      category: "Fire",
      event: text.event,
      urgency,
      severity: input.severity,
      certainty,
      effective,
      expires,
      headline: text.headline,
      description: text.description,
      instruction: text.instruction,
      areaDesc: input.areaDesc,
      circle: `${input.lat},${input.lon} ${BROADCAST_RING_KM}`,
    })),
  };
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const tag = (name: string, value: string) =>
  `<${name}>${escape(value)}</${name}>`;

export function capToXml(alert: CapAlert): string {
  const info = alert.info
    .map((i) =>
      [
        "  <info>",
        `    ${tag("language", i.language)}`,
        `    ${tag("category", i.category)}`,
        `    ${tag("event", i.event)}`,
        `    ${tag("urgency", i.urgency)}`,
        `    ${tag("severity", i.severity)}`,
        `    ${tag("certainty", i.certainty)}`,
        `    ${tag("effective", i.effective)}`,
        `    ${tag("expires", i.expires)}`,
        `    ${tag("headline", i.headline)}`,
        `    ${tag("description", i.description)}`,
        `    ${tag("instruction", i.instruction)}`,
        "    <area>",
        `      ${tag("areaDesc", i.areaDesc)}`,
        `      ${tag("circle", i.circle)}`,
        "    </area>",
        "  </info>",
      ].join("\n"),
    )
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">',
    `  ${tag("identifier", alert.identifier)}`,
    `  ${tag("sender", alert.sender)}`,
    `  ${tag("sent", alert.sent)}`,
    `  ${tag("status", alert.status)}`,
    `  ${tag("msgType", alert.msgType)}`,
    `  ${tag("scope", alert.scope)}`,
    ...(alert.references ? [`  ${tag("references", alert.references)}`] : []),
    info,
    "</alert>",
  ].join("\n");
}
