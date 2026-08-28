export const LOCALES = ["ar", "fr", "en", "kab"] as const;
export type Locale = (typeof LOCALES)[number];

export const RTL_LOCALES: readonly Locale[] = ["ar"];
