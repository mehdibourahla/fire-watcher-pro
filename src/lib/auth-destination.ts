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
    !/^\/(zones|alerts|settings|webhooks|report|admin(?:\/(?:people|risk|queues|places|audit|broadcasts|incidents|fires|sources))?)\/?$/.test(
      path,
    )
  )
    return "/zones";
  return value;
}
