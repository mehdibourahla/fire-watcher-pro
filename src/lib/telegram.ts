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

export function telegramAuthorityHtml(args: {
  source: string;
  body: string;
}): string {
  return [`<b>${esc(args.source)}</b>`, esc(args.body)].join("\n\n");
}
