import { ADMIN_SECTIONS } from "./admin-access";

const ADMIN_PATHS = new Set(ADMIN_SECTIONS.map((section) => section.path));

export function authDestination(value: unknown): string {
  if (
    typeof value !== "string" ||
    [...value].some(
      (character) =>
        character === "\\" ||
        character.charCodeAt(0) <= 32 ||
        character.charCodeAt(0) === 127,
    )
  )
    return "/zones";
  const path = value.split(/[?#]/, 1)[0] ?? "";
  if (
    !/^\/(zones|alerts|settings|webhooks|report)\/?$/.test(path) &&
    !ADMIN_PATHS.has(path.replace(/(.)\/$/, "$1"))
  )
    return "/zones";
  return value;
}
