import type { ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function Explain({
  text,
  children,
}: {
  text?: string | undefined;
  children: ReactNode;
}) {
  if (!text) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-64 border border-border bg-popover px-3 py-2 text-start text-xs leading-relaxed text-popover-foreground shadow-md">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
