import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard/dashboard";

export default function Page() {
  return (
    <main className="min-h-screen">
      {/* useSearchParams (filtros en la URL) requiere un límite de Suspense. */}
      <Suspense fallback={null}>
        <Dashboard />
      </Suspense>
    </main>
  );
}
