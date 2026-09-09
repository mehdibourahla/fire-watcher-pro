import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import {
  archiveExportOptions,
  archivePayloadName,
} from "../src/lib/source-archive-export";

const options = archiveExportOptions(process.argv.slice(2));
const url = process.env["SUPABASE_URL"],
  key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key)
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const db = createClient<Database>(url, key, {
  auth: { persistSession: false },
});
const directory = resolve(options.out);
await mkdir(directory);
await mkdir(join(directory, "payloads"));
const cutoff = new Date().toISOString();
const manifestPath = join(directory, "manifest.ndjson.incomplete");
const manifest = await open(manifestPath, "wx");
let cursor: string | undefined;
let captures = 0;
try {
  while (true) {
    let query = db
      .from("source_captures")
      .select("*")
      .gte("requested_at", options.from)
      .lt("requested_at", options.to)
      .lt("recorded_at", cutoff)
      .order("id")
      .limit(250);
    if (options.source) query = query.eq("source_key", options.source);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw new Error(`Archive catalog: ${error.message}`);
    if (!data?.length) break;
    for (const capture of data) {
      let payload: string | null = null;
      if (capture.status === "captured") {
        if (!capture.sha256 || !capture.storage_path)
          throw new Error(`Missing payload reference: ${capture.id}`);
        const name = archivePayloadName(capture.sha256);
        const path = join(directory, "payloads", name);
        let bytes: Uint8Array | null = null;
        try {
          bytes = await readFile(path);
        } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
        }
        if (bytes === null) {
          const { data: blob, error: downloadError } = await db.storage
            .from("source-archive")
            .download(capture.storage_path);
          if (downloadError || !blob)
            throw new Error(`Archive download failed: ${capture.id}`);
          if (blob.size > 32 * 1024 * 1024)
            throw new Error(`Archive size exceeds limit: ${capture.id}`);
          bytes = new Uint8Array(await blob.arrayBuffer());
          if (
            createHash("sha256").update(bytes).digest("hex") !== capture.sha256
          )
            throw new Error(`Checksum mismatch: ${capture.id}`);
          await writeFile(path, bytes, { flag: "wx" });
        }
        if (
          bytes.byteLength !== capture.byte_length ||
          createHash("sha256").update(bytes).digest("hex") !== capture.sha256
        )
          throw new Error(`Payload integrity failure: ${capture.id}`);
        payload = `payloads/${name}`;
      }
      await manifest.writeFile(`${JSON.stringify({ ...capture, payload })}\n`);
      captures++;
      cursor = capture.id;
    }
  }
} finally {
  await manifest.close();
}
await writeFile(
  join(directory, "export.json"),
  JSON.stringify(
    {
      format_version: 1,
      source: options.source ?? null,
      from: options.from,
      to_exclusive: options.to,
      recorded_before: cutoff,
      exported_at: new Date().toISOString(),
      captures,
      provenance: "run-level",
      retention: "no automatic expiry",
      payload_encoding: "fetch response bytes after HTTP decompression",
    },
    null,
    2,
  ),
  { flag: "wx" },
);
await rename(manifestPath, join(directory, "manifest.ndjson"));
console.log(JSON.stringify({ directory, captures }));
