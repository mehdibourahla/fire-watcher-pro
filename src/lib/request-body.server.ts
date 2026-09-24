export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<{ body: unknown } | { error: string; status: 400 | 413 }> {
  try {
    const reader = request.body?.getReader();
    if (!reader) return { error: "Missing body", status: 400 };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { error: "Body too large", status: 413 };
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return { body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { error: "Invalid JSON", status: 400 };
  }
}
