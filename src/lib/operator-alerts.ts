import type { SourceWatchdogIssue } from "@/lib/source-watchdog";

export type WatchdogTransition = {
  fingerprint: string;
  message: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function watchdogFingerprint(
  issues: readonly SourceWatchdogIssue[],
): string {
  return [
    ...new Set(
      issues.map((i) => `${i.contract_key ?? "?"}:${i.issue_code ?? "?"}`),
    ),
  ]
    .sort()
    .join("\n");
}

export function watchdogTransition(
  previous: string | null,
  issues: readonly SourceWatchdogIssue[],
): WatchdogTransition {
  const fingerprint = watchdogFingerprint(issues);
  if (fingerprint === (previous ?? "")) return { fingerprint, message: null };
  if (fingerprint === "")
    return {
      fingerprint,
      message: "✅ Nadhir sources recovered — watchdog is green.",
    };
  const lines = issues.map(
    (i) =>
      `• <b>${escapeHtml(i.contract_key ?? "?")}</b> ${escapeHtml(i.issue_code ?? "?")}` +
      (i.scheduled_for ? ` (slot ${escapeHtml(i.scheduled_for)})` : ""),
  );
  return {
    fingerprint,
    message: ["🔴 Nadhir source watchdog", ...lines].join("\n"),
  };
}
