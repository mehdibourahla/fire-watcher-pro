import { useTranslation } from "react-i18next";

import type { Locale } from "@/i18n";
import { absoluteTime } from "@/lib/admin-format";
import { relativeTime } from "@/lib/nadhir";

export function When({ at }: { at: string | null | undefined }) {
  const { i18n } = useTranslation();
  if (!at) return <span className="text-muted-foreground">—</span>;
  const locale = i18n.language as Locale;
  return (
    <time dateTime={at} title={absoluteTime(at, locale)}>
      {relativeTime(at, locale)}
    </time>
  );
}
