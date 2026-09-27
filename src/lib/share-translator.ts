import i18n from "@/i18n";
import type { Locale } from "@/i18n/locales-list";
import type { Translate } from "@/lib/share-card";

export function shareTranslator(lang: Locale): Translate {
  const fixed = i18n.getFixedT(lang);
  return (key, vars) => fixed(key, vars ?? {});
}
