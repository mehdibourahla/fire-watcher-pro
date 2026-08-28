import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { ar } from "./locales/ar";
import { en } from "./locales/en";
import { fr } from "./locales/fr";
import { kab } from "./locales/kab";

export { LOCALES, RTL_LOCALES, type Locale } from "./locales-list";
import { LOCALES, RTL_LOCALES, type Locale } from "./locales-list";
import {
  LOCALE_COOKIE,
  readLocaleCookie,
  writeLocaleCookie,
} from "./locale-cookie";

export { LOCALE_COOKIE, readLocaleCookie, writeLocaleCookie };

export const LOCALE_LABELS: Record<Locale, string> = {
  ar: "العربية",
  fr: "Français",
  en: "English",
  kab: "Taqbaylit",
};

export const STORAGE_KEY = "nadhir.locale";

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      ar: { translation: ar },
      fr: { translation: fr },
      en: { translation: en },
      kab: { translation: kab },
    },
    lng: "ar",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function detectLocale(): Locale {
  if (typeof window === "undefined") return "ar";
  return readLocaleCookie();
}

export function applyLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  void i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  document.documentElement.dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
  window.localStorage.setItem(STORAGE_KEY, locale);
  writeLocaleCookie(locale);
}

/** Keeps <html lang/dir> in sync with the locale resolved from the cookie. */
export function syncClientLocale() {
  if (typeof window === "undefined") return;
  applyLocale(detectLocale());
}

/**
 * On the server the module-level i18n is shared by every in-flight request, and
 * changeLanguage is async — so one request could render in another's language.
 * Server renders get their own instance; the browser keeps the singleton so
 * applyLocale still switches the live tree.
 */
export function localeInstance(locale: Locale) {
  if (typeof window === "undefined") {
    return i18n.cloneInstance({ lng: locale });
  }
  if (i18n.language !== locale) void i18n.changeLanguage(locale);
  return i18n;
}

/** Runs on both server and client before render so SSR and hydration agree. */
export function initLocale(): Locale {
  const locale = readLocaleCookie();
  if (typeof window !== "undefined" && i18n.language !== locale) {
    void i18n.changeLanguage(locale);
  }
  return locale;
}

export default i18n;
