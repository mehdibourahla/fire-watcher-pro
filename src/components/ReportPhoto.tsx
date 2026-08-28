import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { signedPhotoUrl } from "@/lib/reports";

/** Renders a report photo from the private bucket through a short-lived signed URL. */
export function ReportPhoto({ photo, className }: { photo: string | null; className?: string }) {
  const { t } = useTranslation();
  const url = useQuery({
    queryKey: ["report-photo", photo],
    queryFn: () => signedPhotoUrl(photo),
    enabled: !!photo,
    staleTime: 20 * 60 * 1000,
  });

  if (!photo) return null;
  if (!url.data) {
    return <p className="text-xs text-muted-foreground">{t("reports.photoUnavailable")}</p>;
  }
  return (
    <a href={url.data} target="_blank" rel="noreferrer">
      <img
        src={url.data}
        alt={t("reports.photoAlt")}
        loading="lazy"
        className={className ?? "mt-2 h-28 w-40 rounded-md border border-border object-cover"}
      />
    </a>
  );
}
