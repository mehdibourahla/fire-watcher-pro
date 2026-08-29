const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROP = new Set(["eXIf", "tEXt", "iTXt", "zTXt"]);

function assemble(
  bytes: Uint8Array,
  keep: [number, number][],
): Uint8Array<ArrayBuffer> {
  const size = keep.reduce((n, [from, to]) => n + (to - from), 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const [from, to] of keep) {
    out.set(bytes.subarray(from, to), at);
    at += to - from;
  }
  return out;
}

const ICC_MARKER = "ICC_PROFILE\0";

// APP2 carries ICC profiles but also MPF, whose embedded second image keeps its own
// Exif and GPS, so the segment is kept on its payload identifier, not its marker.
function isIccProfile(bytes: Uint8Array, payloadAt: number): boolean {
  for (let k = 0; k < ICC_MARKER.length; k += 1) {
    if (bytes[payloadAt + k] !== ICC_MARKER.charCodeAt(k)) return false;
  }
  return true;
}

/** Keeps JFIF (APP0) and a real ICC profile (APP2); every other APPn carries Exif,
 *  XMP, IPTC or MPF, which is where the reporter's GPS and device identity live. */
function stripJpeg(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const keep: [number, number][] = [[0, 2]];
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error("unsupported_type");
    const marker = bytes[i + 1]!;
    if (marker === 0xd9) {
      keep.push([i, i + 2]);
      break;
    }
    if (marker === 0xda) {
      keep.push([i, bytes.length]);
      break;
    }
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    const isApp = marker >= 0xe1 && marker <= 0xef;
    const drop =
      marker === 0xfe ||
      (isApp && !(marker === 0xe2 && isIccProfile(bytes, i + 4)));
    if (!drop) keep.push([i, i + 2 + length]);
    i += 2 + length;
  }
  return assemble(bytes, keep);
}

function stripPng(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const keep: [number, number][] = [[0, 8]];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 8;
  while (i + 8 <= bytes.length) {
    const length = view.getUint32(i);
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    const end = i + 12 + length;
    if (!PNG_DROP.has(type)) keep.push([i, Math.min(end, bytes.length)]);
    if (type === "IEND") break;
    i = end;
  }
  return assemble(bytes, keep);
}

export function stripImageMetadata(
  bytes: Uint8Array,
  type: string,
): Uint8Array<ArrayBuffer> {
  if (type === "image/jpeg" || type === "image/jpg") {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
      throw new Error("unsupported_type");
    return stripJpeg(bytes);
  }
  if (type === "image/png") {
    if (PNG_SIGNATURE.some((b, i) => bytes[i] !== b))
      throw new Error("unsupported_type");
    return stripPng(bytes);
  }
  throw new Error("unsupported_type");
}
