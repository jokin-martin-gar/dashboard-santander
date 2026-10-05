"use client";

import type { ReactNode } from "react";
import { AlertTriangle, FileWarning, Loader2, Upload } from "lucide-react";
import type { LoadError, LoadStatus } from "@/hooks/use-dataset";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ status }: { status: LoadStatus }) {
  const label = status === "parsing" ? "Analizando y normalizando el Excel…" : "Cargando el Excel predeterminado…";
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex items-center gap-2.5 text-[14px] text-muted-foreground" role="status" data-testid="loading-state">
        <Loader2 className="size-4 animate-spin" aria-hidden /> {label}
      </div>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[124px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-[440px] rounded-xl lg:col-span-2" />
        <Skeleton className="h-[440px] rounded-xl" />
      </div>
    </div>
  );
}

export function ErrorState({ error, onUpload, onRetry }: { error: LoadError; onUpload: () => void; onRetry: () => void }) {
  return (
    <div className="mx-auto mt-10 flex max-w-lg flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-10 text-center" role="alert" data-testid="error-state">
      {error.kind === "no_default_file" ? (
        <FileWarning className="size-9 text-muted-foreground" aria-hidden />
      ) : (
        <AlertTriangle className="size-9 text-warning-fg" aria-hidden />
      )}
      <div>
        <h2 className="text-[17px] font-semibold">{error.title}</h2>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">{error.message}</p>
        {error.details.length ? (
          <ul className="mt-2 text-left text-[13px] text-muted-foreground">
            {error.details.map((d) => (
              <li key={d}>• {d}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button onClick={onUpload}>
          <Upload aria-hidden /> Cargar un Excel
        </Button>
        <Button variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    </div>
  );
}

export function Notice({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg border border-[#f1dfb8] bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning-fg"
      role="note"
      data-testid={testId}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
