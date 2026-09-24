type Tree = { [key: string]: string | Tree };

export function overlay<T extends Tree>(base: T, top: object): T {
  const result: Tree = { ...base };
  for (const [key, value] of Object.entries(top) as [string, string | Tree][]) {
    const under = result[key];
    result[key] =
      typeof value === "object" && typeof under === "object"
        ? overlay(under, value)
        : value;
  }
  return result as T;
}
