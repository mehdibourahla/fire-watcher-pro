import { createHash } from "node:crypto";

// runs before jobs: a job leaves only once nothing hot points at it
export const COLD_TABLES = [
  "weather_snapshots",
  "risk_forecasts",
  "broadcast_audit",
  "airport_observations",
  "source_runs",
  "source_jobs",
] as const;
export type ColdTable = (typeof COLD_TABLES)[number];

export type Summary = { rows: number; digest: string | null };

export type ColdArchiveDeps = {
  pendingDays: (table: ColdTable) => Promise<string[]>;
  exportDay: (
    table: ColdTable,
    day: string,
  ) => Promise<{ file: Summary; source: Summary; bytes: Uint8Array }>;
  readBack: (bytes: Uint8Array) => Promise<Summary>;
  upload: (path: string, bytes: Uint8Array) => Promise<void>;
  download: (path: string) => Promise<Uint8Array>;
  commit: (args: {
    table: ColdTable;
    day: string;
    rows: number;
    keyDigest: string | null;
    sha256: string | null;
    bytes: number | null;
    path: string | null;
  }) => Promise<number>;
  log: (line: Record<string, unknown>) => void;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isColdTable(value: string): value is ColdTable {
  return (COLD_TABLES as readonly string[]).includes(value);
}

export function coldPath(
  prefix: "cold" | "trial",
  table: ColdTable,
  day: string,
) {
  if (!DAY.test(day)) throw new Error(`Not a day: ${day}`);
  return `${prefix}/${table}/${day.replaceAll("-", "/")}.parquet`;
}

export function exportSql(
  table: ColdTable,
  day: string,
  parquet: string,
  summary: string,
) {
  if (!isColdTable(table) || !DAY.test(day))
    throw new Error("Unsafe export input");
  const candidates = `private.cold_candidates(''${table}'', ''${day}'')`;
  return `INSTALL postgres; LOAD postgres;
ATTACH '' AS pg (TYPE postgres, READ_ONLY);
COPY (SELECT * FROM postgres_query('pg', 'SELECT t.* FROM public.${table} t JOIN ${candidates} c ON c.id = t.id'))
  TO '${parquet}' (FORMAT parquet, COMPRESSION zstd);
COPY (
  SELECT 'file' AS side, count(*) AS rows, md5(string_agg(id::varchar, ',' ORDER BY id::varchar)) AS digest
  FROM read_parquet('${parquet}')
  UNION ALL
  SELECT 'source', * FROM postgres_query('pg',
    'SELECT count(*), md5(string_agg(id::text, '','' ORDER BY id::text COLLATE "C")) FROM ${candidates}')
) TO '${summary}' (FORMAT json);`;
}

export function readBackSql(parquet: string, summary: string) {
  return `COPY (SELECT count(*) AS rows, md5(string_agg(id::varchar, ',' ORDER BY id::varchar)) AS digest
  FROM read_parquet('${parquet}')) TO '${summary}' (FORMAT json);`;
}

export const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

function same(a: Summary, b: Summary) {
  return a.rows === b.rows && a.digest === b.digest;
}

async function proveDay(
  deps: ColdArchiveDeps,
  table: ColdTable,
  day: string,
  path: string,
) {
  const exported = await deps.exportDay(table, day);
  if (!same(exported.file, exported.source))
    throw new Error(
      `${table} ${day}: file has ${exported.file.rows} rows, database ${exported.source.rows}`,
    );
  if (exported.file.rows === 0) return { summary: exported.file, bytes: null };
  const hash = sha256(exported.bytes);
  await deps.upload(path, exported.bytes);
  const stored = await deps.download(path);
  if (sha256(stored) !== hash)
    throw new Error(`${table} ${day}: stored file differs from the upload`);
  if (!same(await deps.readBack(stored), exported.file))
    throw new Error(`${table} ${day}: stored file reads back differently`);
  return {
    summary: exported.file,
    bytes: { sha256: hash, length: exported.bytes.length },
  };
}

export async function archiveColdDays(deps: ColdArchiveDeps) {
  let days = 0;
  for (const table of COLD_TABLES) {
    for (const day of await deps.pendingDays(table)) {
      const path = coldPath("cold", table, day);
      const proven = await proveDay(deps, table, day, path);
      const deleted = await deps.commit({
        table,
        day,
        rows: proven.summary.rows,
        keyDigest: proven.summary.digest,
        sha256: proven.bytes?.sha256 ?? null,
        bytes: proven.bytes?.length ?? null,
        path: proven.bytes ? path : null,
      });
      deps.log({ table, day, rows: deleted, path: proven.bytes ? path : null });
      days++;
    }
  }
  return days;
}

export async function trialColdDay(
  deps: ColdArchiveDeps,
  table: ColdTable,
  day: string,
) {
  const path = coldPath("trial", table, day);
  const proven = await proveDay(deps, table, day, path);
  deps.log({
    trial: true,
    table,
    day,
    ...proven.summary,
    ...proven.bytes,
    path,
  });
}
