import { Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { OfficialIncident } from "@/lib/nadhir";
import {
  SHARE_FORMATS,
  incidentUrl,
  linkTargets,
  shareImagePath,
  shareLocale,
  type ShareFormat,
} from "@/lib/share-card";
import { cn } from "@/lib/utils";

const CARDS = [
  "story",
  "post",
  "sticker",
] as const satisfies readonly ShareFormat[];
type Loaded = { file: File; url: string } | "error" | undefined;

export function IncidentShareSheet({
  incident,
}: {
  incident: OfficialIncident;
}) {
  const { t, i18n } = useTranslation();
  const lang = shareLocale(i18n.language);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<(typeof CARDS)[number]>("story");
  const [images, setImages] = useState<Partial<Record<ShareFormat, Loaded>>>(
    {},
  );
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const urls: string[] = [];
    let live = true;
    for (const format of CARDS) {
      void fetch(shareImagePath(incident.id, format, lang, incident.updated_at))
        .then(async (res) => {
          if (!res.ok) throw new Error(`${res.status}`);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          urls.push(url);
          const file = new File([blob], `nadhir-${format}.png`, {
            type: blob.type,
          });
          if (live) setImages((prev) => ({ ...prev, [format]: { file, url } }));
        })
        .catch(
          () => live && setImages((prev) => ({ ...prev, [format]: "error" })),
        );
    }
    return () => {
      live = false;
      urls.forEach(URL.revokeObjectURL);
      setImages({});
      setNotice(null);
    };
  }, [open, attempt, incident.id, incident.updated_at, lang]);

  const link = incidentUrl(window.location.origin, incident.id, lang);
  const targets = linkTargets(link);
  const current = images[active];
  const file = current && current !== "error" ? current.file : null;
  const canShareFiles =
    !!file &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });

  const shareImage = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file] });
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === "AbortError")
        return;
      setNotice(t("shareCard.failed"));
    }
  };
  const save = () => {
    if (!current || current === "error") return;
    const a = document.createElement("a");
    a.href = current.url;
    a.download = current.file.name;
    a.click();
  };
  const copySticker = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": Promise.resolve(file) }),
      ]);
      setNotice(t("shareCard.stickerCopied"));
    } catch {
      setNotice(t("shareCard.failed"));
    }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setNotice(t("shareCard.linkCopied"));
    } catch {
      setNotice(t("shareCard.failed"));
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Share2 aria-hidden />
          {t("shareCard.open")}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("shareCard.title")}</SheetTitle>
        </SheetHeader>
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
          {CARDS.map((format) => {
            const image = images[format];
            const { width, height } = SHARE_FORMATS[format];
            return (
              <button
                key={format}
                type="button"
                onClick={() => setActive(format)}
                aria-pressed={active === format}
                className={cn(
                  "flex shrink-0 snap-center flex-col items-center gap-2 rounded-xl p-2",
                  active === format ? "ring-2 ring-primary" : "opacity-70",
                )}
              >
                <span
                  className="flex h-56 items-center justify-center overflow-hidden rounded-lg bg-muted"
                  style={{ aspectRatio: `${width} / ${height}` }}
                >
                  {image === "error" ? (
                    <span className="p-2 text-center text-xs">
                      {t("shareCard.cardError")}
                    </span>
                  ) : image ? (
                    <img
                      src={image.url}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="h-full w-full animate-pulse bg-muted-foreground/10" />
                  )}
                </span>
                <span className="text-sm">
                  {t(`shareCard.formats.${format}`)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="space-y-3 px-4 pb-6">
          <p aria-live="polite" className="min-h-5 text-sm">
            {notice}
          </p>
          {current === "error" ? (
            <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              {t("shareCard.retry")}
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t("shareCard.image")}
          </p>
          <div className="flex flex-wrap gap-2">
            {active === "sticker" ? (
              <Button disabled={!file} onClick={() => void copySticker()}>
                {t("shareCard.copySticker")}
              </Button>
            ) : canShareFiles ? (
              <Button onClick={() => void shareImage()}>
                {t("shareCard.shareImage")}
              </Button>
            ) : null}
            <Button
              variant={
                canShareFiles || active === "sticker" ? "outline" : "default"
              }
              disabled={!file}
              onClick={save}
            >
              {t("shareCard.save")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("shareCard.link")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a
                href={targets.whatsapp}
                target="_blank"
                rel="noreferrer noopener"
              >
                WhatsApp
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href={targets.facebook}
                target="_blank"
                rel="noreferrer noopener"
              >
                Facebook
              </a>
            </Button>
            <Button variant="outline" onClick={() => void copyLink()}>
              {t("shareCard.copyLink")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
