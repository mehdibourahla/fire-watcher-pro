import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import {
  archiveColdDays,
  type ColdArchiveDeps,
  exportSql,
  isColdTable,
  readBackSql,
  type Summary,
  trialColdDay,
} from "../src/lib/cold-archive";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const db = createClient<Database>(
  required("SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);
const source = new URL(required("COLD_ARCHIVE_DB_URL"));
const password = decodeURIComponent(source.password);
if (process.env["GITHUB_ACTIONS"]) console.log(`::add-mask::${password}`);
// libpq reads these, so the password is never part of the SQL or of a DuckDB error
const sourceEnv = {
  ...process.env,
  PGHOST: source.hostname,
  PGPORT: source.port || "5432",
  PGUSER: decodeURIComponent(source.username),
  PGPASSWORD: password,
  PGDATABASE: source.pathname.slice(1) || "postgres",
  PGSSLMODE: source.searchParams.get("sslmode") ?? "require",
};
const duckdb = process.env["DUCKDB_BIN"] ?? "duckdb";
const run = promisify(execFile);
const work = await mkdtemp(join(tmpdir(), "cold-archive-"));
const BUCKET = "cold-archive";

async function duck(sql: string, env: NodeJS.ProcessEnv) {
  await run(duckdb, [":memory:", "-bail", "-c", sql], { env });
}

async function summaries(file: string) {
  return (await readFile(file, "utf8"))
    .trim()
    .split("\n")
    .map(
      (line) =>
        JSON.parse(line) as {
          side?: string;
          rows: number;
          digest: string | null;
        },
    )
    .map(({ side, rows, digest }) => ({
      side,
      summary: { rows: Number(rows), digest } satisfies Summary,
    }));
}

const deps: ColdArchiveDeps = {
  pendingDays: async (table) => {
    const { data, error } = await db.rpc("cold_pending_days", {
      _table: table,
    });
    if (error) throw new Error(`Pending days of ${table}: ${error.message}`);
    return data;
  },
  exportDay: async (table, day) => {
    const parquet = join(work, `${table}-${day}.parquet`);
    const summary = join(work, `${table}-${day}.json`);
    await duck(exportSql(table, day, parquet, summary), sourceEnv);
    const sides = await summaries(summary);
    const side = (name: string) => {
      const found = sides.find((s) => s.side === name);
      if (!found) throw new Error(`${table} ${day}: no ${name} summary`);
      return found.summary;
    };
    return {
      file: side("file"),
      source: side("source"),
      bytes: await readFile(parquet),
    };
  },
  readBack: async (bytes) => {
    const parquet = join(work, "stored.parquet");
    const summary = join(work, "stored.json");
    await writeFile(parquet, bytes);
    await duck(readBackSql(parquet, summary), process.env);
    const [stored] = await summaries(summary);
    if (!stored) throw new Error("Stored file produced no summary");
    return stored.summary;
  },
  upload: async (path, bytes) => {
    const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
      upsert: true,
      contentType: "application/vnd.apache.parquet",
    });
    if (error) throw new Error(`Upload ${path}: ${error.message}`);
  },
  download: async (path) => {
    const { data, error } = await db.storage.from(BUCKET).download(path);
    if (error || !data)
      throw new Error(`Download ${path}: ${error?.message ?? "empty"}`);
    return new Uint8Array(await data.arrayBuffer());
  },
  commit: async ({ table, day, rows, keyDigest, sha256, bytes, path }) => {
    const { data, error } = await db.rpc("cold_archive_commit", {
      _table: table,
      _day: day,
      _rows: rows,
      ...(keyDigest === null ? {} : { _key_digest: keyDigest }),
      ...(sha256 === null ? {} : { _sha256: sha256 }),
      ...(bytes === null ? {} : { _bytes: bytes }),
      ...(path === null ? {} : { _path: path }),
    });
    if (error) throw new Error(`Commit ${table} ${day}: ${error.message}`);
    return data;
  },
  log: (line) => console.log(JSON.stringify(line)),
};

try {
  const [mode, table, day] = process.argv.slice(2);
  if (mode === "--trial") {
    if (!table || !isColdTable(table) || !day)
      throw new Error("Usage: --trial <table> <yyyy-mm-dd>");
    await trialColdDay(deps, table, day);
  } else if (mode === undefined) {
    console.log(JSON.stringify({ archivedDays: await archiveColdDays(deps) }));
  } else {
    throw new Error(`Unknown argument ${mode}`);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
