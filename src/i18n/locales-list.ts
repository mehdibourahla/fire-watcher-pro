// Kabyle is translated in full and stays registered and key-parity tested, but is
// withheld from the pickers until a speaker reviews it. Re-enable by moving it back.
export const LOCALES = ["ar", "fr", "en"] as const;
export const UNREVIEWED_LOCALES = ["kab"] as const;
export type Locale = (typeof LOCALES)[number];
export type AnyLocale = Locale | (typeof UNREVIEWED_LOCALES)[number];

export const RTL_LOCALES: readonly Locale[] = ["ar"];
