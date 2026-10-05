import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Descripción accesible del contenido (gráficos). */
  description?: string;
  id?: string;
  testId?: string;
}

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  description,
  id,
  testId,
}: SectionCardProps) {
  const titleId = useId();
  const descId = useId();
  return (
    <section
      id={id}
      data-testid={testId}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cn(
        "min-w-0 rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(15,17,21,0.04)]",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            {title}
          </h2>
          {subtitle ? <div className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {description ? (
        <p id={descId} className="sr-only">
          {description}
        </p>
      ) : null}
      <div className={cn("px-5 pb-5", bodyClassName)}>{children}</div>
    </section>
  );
}
