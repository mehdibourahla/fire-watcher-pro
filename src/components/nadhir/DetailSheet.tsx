import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
};

/** Bottom sheet under lg, docked side rail from lg up. */
export function DetailSheet({ open, onClose, children, title }: Props) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label={title ?? t("fire.detail")}
      className="map-scroll sheet-in fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 max-h-[65dvh] overflow-x-hidden overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-surface shadow-[var(--shadow-sheet)] lg:absolute lg:inset-y-3 lg:end-3 lg:start-auto lg:max-h-none lg:w-[380px] lg:rounded-2xl lg:border"
    >
      <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <span
          className="h-1 w-10 rounded-full bg-border lg:hidden"
          aria-hidden
        />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="ms-auto flex size-11 items-center justify-center rounded-full hover:bg-muted"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </aside>
  );
}
