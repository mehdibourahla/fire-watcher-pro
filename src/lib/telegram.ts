const APP_URL = "https://nadhir.app";
const SEVERITY_RANK: Record<string, number> = { Extreme: 2, Severe: 1 };

export function telegramSeverityAllowed(severity: string): boolean {
  return (SEVERITY_RANK[severity] ?? 0) >= 1;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function telegramFireHtml(args: {
  headline: string;
  description: string;
  shortId: string;
}): string {
  return [
    `<b>${esc(args.headline)}</b>`,
    esc(args.description),
    `<a href="${APP_URL}/fire/${esc(args.shortId)}">${esc(args.shortId)} — ${APP_URL}/fire/${esc(args.shortId)}</a>`,
  ].join("\n\n");
}

export function telegramOnmHtml(args: {
  title: string;
  headlineFr: string | null;
}): string {
  return [
    "<b>ONM · Météo Algérie</b>",
    esc(args.headlineFr ?? args.title),
    `<a href="${APP_URL}/forecast">${APP_URL}/forecast</a>`,
  ].join("\n\n");
}

export function telegramAuthorityHtml(args: {
  source: string;
  body: string;
}): string {
  return [`<b>${esc(args.source)}</b>`, esc(args.body)].join("\n\n");
}
