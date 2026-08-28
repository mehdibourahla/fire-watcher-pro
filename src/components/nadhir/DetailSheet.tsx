import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

/** Bottom sheet under lg, docked side rail from lg up. */
export function DetailSheet({ open, onClose, children }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label={t("fire.detail")}
      className="sheet-in fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface shadow-[var(--shadow-sheet)] lg:absolute lg:inset-y-3 lg:end-3 lg:start-auto lg:max-h-none lg:w-[380px] lg:rounded-2xl lg:border"
    >
      <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <span
          className="h-1 w-10 rounded-full bg-border lg:hidden"
          aria-hidden
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="ms-auto rounded-full p-1.5 hover:bg-muted"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </aside>
  );
}
