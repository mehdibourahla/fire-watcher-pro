import { useTranslation } from "react-i18next";

import { RTL_LOCALES, type Locale } from "@/i18n";

export function useEndSide(): "left" | "right" {
  const { i18n } = useTranslation();
  return RTL_LOCALES.includes(i18n.language as Locale) ? "left" : "right";
}
