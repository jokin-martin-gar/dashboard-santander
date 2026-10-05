"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface TooltipAnchor {
  /** Coordenadas relativas al contenedor posicionado. */
  x: number;
  y: number;
}

/**
 * Tooltip absoluto dentro de un contenedor `relative`. Se recoloca para no salirse ni del
 * contenedor ni de la ventana (se mide tras el render).
 */
export function FloatingTooltip({ anchor, children }: { anchor: TooltipAnchor | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const parent = el.offsetParent as HTMLElement | null;
    const pw = parent?.clientWidth ?? window.innerWidth;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = 12;
    let left = anchor.x + gap;
    if (left + w > pw - 4) left = anchor.x - w - gap;
    left = Math.max(4, Math.min(left, pw - w - 4));
    // Ajuste adicional al viewport (p. ej. contenedor más ancho que la pantalla).
    const parentRect = parent?.getBoundingClientRect();
    if (parentRect) {
      const absLeft = parentRect.left + left;
      if (absLeft + w > window.innerWidth - 4) left -= absLeft + w - (window.innerWidth - 4);
      if (parentRect.left + left < 4) left = 4 - parentRect.left;
    }
    let top = anchor.y - h - gap;
    if (top < 0) top = anchor.y + gap;
    setPos({ left, top });
  }, [anchor, children]);

  if (!anchor) return null;
  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none absolute z-30 w-max max-w-[min(300px,calc(100vw-24px))] rounded-lg border border-border bg-popover px-3 py-2.5 text-[12.5px] text-popover-foreground shadow-lg"
      style={{ left: pos?.left ?? anchor.x, top: pos?.top ?? anchor.y, visibility: pos ? "visible" : "hidden" }}
    >
      {children}
    </div>
  );
}

export function TooltipRow({ label, value, swatch }: { label: string; value: ReactNode; swatch?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {swatch ? <span className="inline-block size-2.5 rounded-sm" style={{ background: swatch }} aria-hidden /> : null}
        {label}
      </span>
      <span className="font-medium tabular text-foreground">{value}</span>
    </div>
  );
}
