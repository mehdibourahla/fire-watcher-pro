import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function MapWorkspacePanel({
  expanded,
  onExpandedChange,
  children,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const start = useRef<number | null>(null);
  const dragged = useRef(false);
  return (
    <section
      aria-label={t("civilMap.list")}
      className={`map-workspace-panel absolute inset-x-3 bottom-3 z-10 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-xl backdrop-blur lg:inset-y-4 lg:start-4 lg:end-auto lg:h-auto lg:w-[380px] lg:rounded-3xl ${expanded ? "h-[76%]" : "h-[100px]"}`}
    >
      <button
        type="button"
        aria-label={t(expanded ? "civilMap.collapse" : "civilMap.expand")}
        aria-expanded={expanded}
        className="map-workspace-handle flex h-11 shrink-0 touch-none items-center justify-center lg:hidden"
        onPointerDown={(event) => {
          start.current = event.clientY;
          dragged.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          if (
            start.current !== null &&
            Math.abs(event.clientY - start.current) > 40
          ) {
            dragged.current = true;
            onExpandedChange(event.clientY < start.current);
          }
          start.current = null;
        }}
        onPointerCancel={() => {
          start.current = null;
          dragged.current = false;
        }}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          onExpandedChange(!expanded);
        }}
      >
        <span className="h-1 w-10 rounded-full bg-border" />
      </button>
      {children}
      <style>{`.map-workspace-panel {
        transition: height 280ms cubic-bezier(.22, 1, .36, 1), box-shadow 280ms ease;
        animation: map-panel-enter 220ms cubic-bezier(.22, 1, .36, 1);
      }
      .map-workspace-handle span { transition: width 180ms ease, background-color 180ms ease; }
      .map-workspace-handle:hover span, .map-workspace-handle:focus-visible span { width: 48px; background: var(--ink-soft); }
      @keyframes map-panel-enter { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      @media (prefers-reduced-motion: reduce) {
        .map-workspace-panel, .map-workspace-handle span { transition: none; animation: none; }
      }
      @media (min-width: 640px) and (max-height: 500px) {
        .map-workspace-panel { inset-block: 12px; inset-inline-start: 12px; inset-inline-end: auto; width: 380px; height: auto; }
        .map-workspace-handle { display: none; }
      }`}</style>
    </section>
  );
}
