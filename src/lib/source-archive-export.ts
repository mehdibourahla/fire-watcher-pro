export function archiveExportOptions(args: string[]) {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (
      !flag ||
      !["--source", "--from", "--to", "--out"].includes(flag) ||
      !value ||
      value.startsWith("--") ||
      values.has(flag)
    ) {
      throw new Error(
        "Use --from <ISO time> --to <ISO time> --out <new directory> [--source <key>]",
      );
    }
    values.set(flag, value);
  }
  const date = (flag: string) => {
    const value = values.get(flag);
    if (
      !value ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) ||
      !Number.isFinite(Date.parse(value))
    ) {
      throw new Error(`${flag} requires an explicit UTC ISO timestamp`);
    }
    const normalized = new Date(value).toISOString();
    if (normalized.slice(0, 19) !== value.slice(0, 19))
      throw new Error(`Invalid ${flag} date`);
    return normalized;
  };
  const from = date("--from"),
    to = date("--to"),
    out = values.get("--out");
  if (from >= to) throw new Error("--from must precede --to (exclusive)");
  if (!out?.trim())
    throw new Error("--out is required and must name a new directory");
  const source = values.get("--source");
  if (source && !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(source))
    throw new Error("Invalid source key");
  return { from, to, out, source };
}

export function archivePayloadName(hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid archive checksum");
  return `${hash}.bin`;
}
