import { beforeEach, describe, expect, it, vi } from "vitest";
const { download } = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ download }) } },
}));
import { downloadSourcePayload } from "../admin-source-archive";

const hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const capture = {
  sha256: hash,
  storage_path: `sha256/${hash}`,
  byte_length: 3,
};
beforeEach(() => vi.clearAllMocks());
describe("archive payload download", () => {
  it("rejects unavailable or tampered references", async () => {
    await expect(
      downloadSourcePayload({ ...capture, storage_path: null }),
    ).rejects.toThrow("unavailable");
    await expect(
      downloadSourcePayload({ ...capture, sha256: "../../bad" }),
    ).rejects.toThrow("checksum");
    expect(download).not.toHaveBeenCalled();
  });
  it("rejects incorrect byte counts and checksums before saving", async () => {
    download.mockResolvedValue({ data: new Blob(["abcd"]), error: null });
    await expect(downloadSourcePayload(capture)).rejects.toThrow(
      "size mismatch",
    );
    download.mockResolvedValue({ data: new Blob(["abd"]), error: null });
    await expect(downloadSourcePayload(capture)).rejects.toThrow(
      "checksum mismatch",
    );
  });
  it("surfaces a storage access failure", async () => {
    download.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(downloadSourcePayload(capture)).rejects.toThrow(
      "download failed",
    );
  });
});
