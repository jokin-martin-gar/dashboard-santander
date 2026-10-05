"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Icono de ayuda accesible por teclado que muestra una explicación (p. ej. la fórmula). */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        className="inline-flex size-5 items-center justify-center rounded-full text-subtle hover:text-foreground focus-visible:text-foreground"
      >
        <Info className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] text-left leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
