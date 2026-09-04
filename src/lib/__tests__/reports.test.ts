import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSignedUrlMock,
  fromMock,
  getUserMock,
  removeMock,
  storageFromMock,
  uploadMock,
} = vi.hoisted(() => ({
  createSignedUrlMock: vi.fn(),
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  removeMock: vi.fn(),
  storageFromMock: vi.fn(),
  uploadMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
    storage: { from: storageFromMock },
  },
}));

import * as reports from "@/lib/reports";

const ownerId = "f0240000-0000-4000-8000-000000000001";
const photoId = "f0241000-0000-4000-8000-000000000001";
const photoPath = `${ownerId}/${photoId}.jpg`;
const reportId = "f0242000-0000-4000-8000-000000000001";

const reportInput = {
  kind: "sighting" as const,
  lat: 36.6,
  lon: 4.05,
  sighting: "smoke" as const,
  size_hint: "small" as const,
  note: null,
  commune_id: null,
  observed_at: "2026-09-01T00:00:00.000Z",
};

const jpeg = {
  name: "evidence.jpg",
  size: 4,
  type: "image/jpeg",
  arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
} as File;
const uploadDraft = { file: jpeg, objectId: photoId };

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

function thenableFilter(result: QueryResult) {
  const filter: Record<string, unknown> = {};
  for (const method of ["eq", "is", "select"]) {
    filter[method] = vi.fn(() => filter);
  }
  filter["maybeSingle"] = vi.fn(async () => result);
  filter["then"] = (resolve: (value: QueryResult) => unknown) =>
    Promise.resolve(result).then(resolve);
  return filter;
}

function reportTable({
  read,
  insert,
  remove,
  events = [],
}: {
  read?: QueryResult;
  insert?: QueryResult;
  remove?: QueryResult;
  events?: string[];
}) {
  return {
    select: vi.fn(() => thenableFilter(read ?? { data: null, error: null })),
    insert: vi.fn(async () => {
      events.push("report-insert");
      return insert ?? { data: null, error: null };
    }),
    delete: vi.fn(() => {
      events.push("report-delete");
      return thenableFilter(remove ?? { data: { id: reportId }, error: null });
    }),
  };
}

describe("report photo boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: ownerId } },
      error: null,
    });
    storageFromMock.mockReturnValue({
      createSignedUrl: createSignedUrlMock,
      remove: removeMock,
      upload: uploadMock,
    });
  });

  it.each([
    "https://attacker.example/photo.jpg",
    `${ownerId}/../${photoId}.jpg`,
    `${ownerId}/${photoId}.gif`,
    `${ownerId}//${photoId}.png`,
  ])("refuses to sign attacker-selected source %s", async (source) => {
    await expect(reports.signedPhotoUrl(source)).resolves.toBeNull();
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("signs a canonical private JPEG object key", async () => {
    createSignedUrlMock.mockResolvedValue({
      data: {
        signedUrl: "https://project.supabase.co/storage/v1/signed/photo",
      },
      error: null,
    });

    await expect(reports.signedPhotoUrl(photoPath)).resolves.toBe(
      "https://project.supabase.co/storage/v1/signed/photo",
    );
    expect(createSignedUrlMock).toHaveBeenCalledWith(photoPath, 60 * 30);
  });

  it("does not return a non-network URL from a malformed signing response", async () => {
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: "javascript:alert(1)" },
      error: null,
    });

    await expect(reports.signedPhotoUrl(photoPath)).resolves.toBeNull();
  });
});

describe("report photo draft lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:local-photo"),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.spyOn(crypto, "randomUUID").mockReturnValue(photoId);
  });

  it("keeps selection local until report submission", () => {
    const createDraft = Reflect.get(reports, "createReportPhotoDraft") as
      ((file: File) => { objectId: string; previewUrl: string }) | undefined;

    expect(createDraft).toBeTypeOf("function");
    const draft = createDraft?.(jpeg);
    expect(draft?.previewUrl).toBe("blob:local-photo");
    expect(draft?.objectId).toBe(photoId);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("revokes the local preview when selection is removed or abandoned", () => {
    const createDraft = Reflect.get(reports, "createReportPhotoDraft") as
      ((file: File) => { dispose: () => void }) | undefined;
    expect(createDraft).toBeTypeOf("function");

    const draft = createDraft?.(jpeg);
    draft?.dispose();
    draft?.dispose();

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-photo");
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("revokes both previews across replacement and unmount", () => {
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce("blob:first-photo")
      .mockReturnValueOnce("blob:replacement-photo");

    const first = reports.createReportPhotoDraft(jpeg);
    const replacement = reports.createReportPhotoDraft(jpeg);
    first.dispose();
    replacement.dispose();

    expect(URL.revokeObjectURL).toHaveBeenNthCalledWith(1, "blob:first-photo");
    expect(URL.revokeObjectURL).toHaveBeenNthCalledWith(
      2,
      "blob:replacement-photo",
    );
    expect(removeMock).not.toHaveBeenCalled();
  });
});

describe("report creation photo cleanup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: ownerId } },
      error: null,
    });
    storageFromMock.mockReturnValue({
      createSignedUrl: createSignedUrlMock,
      remove: removeMock,
      upload: uploadMock,
    });
    uploadMock.mockResolvedValue({ data: { path: photoPath }, error: null });
  });

  it("creates reports without photos without touching Storage", async () => {
    const table = reportTable({ insert: { data: null, error: null } });
    fromMock.mockReturnValue(table);

    await reports.createReport(reportInput);

    expect(uploadMock).not.toHaveBeenCalled();
    expect(table.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: ownerId, photo_url: null }),
    );
  });

  it("uploads only as part of submission and stores the returned private key", async () => {
    const table = reportTable({ insert: { data: null, error: null } });
    fromMock.mockReturnValue(table);
    await reports.createReport(reportInput, uploadDraft);

    expect(uploadMock).toHaveBeenCalledOnce();
    expect(uploadMock.mock.calls[0]?.[1]).toBeInstanceOf(Blob);
    expect(uploadMock.mock.calls[0]?.[1]).not.toBe(jpeg);
    expect(table.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: ownerId, photo_url: photoPath }),
    );
  });

  it("removes an uploaded object when report creation fails", async () => {
    const events: string[] = [];
    uploadMock.mockImplementation(async () => {
      events.push("photo-upload");
      return { data: { path: photoPath }, error: null };
    });
    removeMock.mockImplementation(async () => {
      events.push("photo-remove");
      return { data: [], error: null };
    });
    fromMock.mockReturnValue(
      reportTable({
        insert: { data: null, error: { message: "private constraint detail" } },
        events,
      }),
    );
    await expect(
      reports.createReport(reportInput, uploadDraft),
    ).rejects.toMatchObject({ message: "reports.submitFailed" });
    expect(events).toEqual(["photo-upload", "report-insert", "photo-remove"]);
    expect(removeMock).toHaveBeenCalledWith([photoPath]);
  });

  it("reports cleanup failure safely without claiming report success", async () => {
    fromMock.mockReturnValue(
      reportTable({
        insert: { data: null, error: { message: "private insert detail" } },
      }),
    );
    removeMock.mockResolvedValue({
      data: null,
      error: { message: "private storage detail" },
    });
    const failure = await reports
      .createReport(reportInput, uploadDraft)
      .catch((error) => error);

    expect(failure).toMatchObject({ message: "reports.submitCleanupFailed" });
    expect(failure.message).not.toContain("private");
  });

  it("keeps the photo when a lost insert response already committed the report", async () => {
    const table = reportTable({
      read: { data: { id: reportId }, error: null },
    });
    table.insert.mockRejectedValue(new Error("response lost after commit"));
    fromMock.mockReturnValue(table);
    vi.spyOn(crypto, "randomUUID").mockReturnValue(reportId);

    await expect(
      reports.createReport(reportInput, uploadDraft),
    ).resolves.toBeUndefined();
    expect(table.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: reportId, photo_url: photoPath }),
    );
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("preserves the one private object when commit reconciliation also fails", async () => {
    const uncertainQuery = thenableFilter({ data: null, error: null });
    uncertainQuery["maybeSingle"] = vi.fn(async () => {
      throw new Error("reconciliation transport failed");
    });
    fromMock.mockReturnValue({
      insert: vi.fn(async () => {
        throw new Error("insert response lost");
      }),
      select: vi.fn(() => uncertainQuery),
    });

    await expect(
      reports.createReport(reportInput, uploadDraft),
    ).rejects.toMatchObject({ message: "reports.submitUnknown" });
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("maps an upload transport rejection to safe guidance", async () => {
    uploadMock.mockRejectedValue(new Error("private upload transport detail"));
    fromMock.mockReturnValue(reportTable({}));
    await expect(
      reports.createReport(reportInput, uploadDraft),
    ).rejects.toMatchObject({ message: "reports.photoFailed" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("reuses one object key across retry after cleanup failure", async () => {
    fromMock.mockReturnValue(
      reportTable({
        insert: { data: null, error: { message: "private insert detail" } },
      }),
    );
    removeMock
      .mockResolvedValueOnce({
        data: null,
        error: { message: "private cleanup detail" },
      })
      .mockResolvedValueOnce({ data: [], error: null });

    await reports.createReport(reportInput, uploadDraft).catch(() => undefined);
    await reports.createReport(reportInput, uploadDraft).catch(() => undefined);

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(uploadMock.mock.calls.map(([path]) => path)).toEqual([
      photoPath,
      photoPath,
    ]);
    expect(uploadMock.mock.calls[0]?.[2]).toMatchObject({ upsert: true });
    expect(removeMock).toHaveBeenNthCalledWith(1, [photoPath]);
    expect(removeMock).toHaveBeenNthCalledWith(2, [photoPath]);
  });
});

describe("report deletion photo cleanup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: ownerId } },
      error: null,
    });
    storageFromMock.mockReturnValue({
      createSignedUrl: createSignedUrlMock,
      remove: removeMock,
      upload: uploadMock,
    });
  });

  it("removes the private object before deleting its report row", async () => {
    const events: string[] = [];
    removeMock.mockImplementation(async () => {
      events.push("photo-remove");
      return { data: [], error: null };
    });
    fromMock.mockReturnValue(
      reportTable({
        read: {
          data: { id: reportId, user_id: ownerId, photo_url: photoPath },
          error: null,
        },
        remove: { data: { id: reportId }, error: null },
        events,
      }),
    );

    await reports.deleteReport(reportId);

    expect(events).toEqual(["photo-remove", "report-delete"]);
  });

  it("keeps the report row when private object cleanup fails", async () => {
    const table = reportTable({
      read: {
        data: { id: reportId, user_id: ownerId, photo_url: photoPath },
        error: null,
      },
    });
    fromMock.mockReturnValue(table);
    removeMock.mockResolvedValue({
      data: null,
      error: { message: "private storage detail" },
    });

    await expect(reports.deleteReport(reportId)).rejects.toMatchObject({
      message: "reports.deletePhotoCleanupFailed",
    });
    expect(table.delete).not.toHaveBeenCalled();
  });

  it("maps a cleanup transport rejection without deleting the report row", async () => {
    const table = reportTable({
      read: {
        data: { id: reportId, user_id: ownerId, photo_url: photoPath },
        error: null,
      },
    });
    fromMock.mockReturnValue(table);
    removeMock.mockRejectedValue(new Error("private cleanup transport detail"));

    await expect(reports.deleteReport(reportId)).rejects.toMatchObject({
      message: "reports.deletePhotoCleanupFailed",
    });
    expect(table.delete).not.toHaveBeenCalled();
  });
});
