import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

function cancelled(error: unknown) {
  return error instanceof Error && error.message === "Share canceled";
}

async function share(options: Parameters<typeof Share.share>[0]) {
  try {
    await Share.share(options);
  } catch (error) {
    if (!cancelled(error)) throw error;
  }
}

export function shareText(text: string, url?: string) {
  return share(url ? { text, url } : { text });
}

function base64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function shareImageFile(file: File) {
  const { uri } = await Filesystem.writeFile({
    path: `share/${file.name}`,
    directory: Directory.Cache,
    data: await base64(file),
    recursive: true,
  });
  await share({ files: [uri] });
}
