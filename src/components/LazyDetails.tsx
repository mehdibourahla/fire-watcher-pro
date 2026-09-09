import { useState, type ReactNode } from "react";

export function LazyDetails({
  summary,
  children,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={className}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      {summary}
      {open ? children : null}
    </details>
  );
}
