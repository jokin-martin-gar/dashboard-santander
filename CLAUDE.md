@AGENTS.md

# Dashboard de Riesgo y Transiciones

Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind 4 + shadcn/ui (sobre Base UI: usar
`render` en lugar de `asChild`). SheetJS, d3-sankey, Recharts 3, TanStack Table **v9** (`useTable`,
`tableFeatures`), Vitest, Playwright. Sin backend salvo `app/api/default-excel` (sirve `data/*.xlsx`).

## Comandos

- `npm run dev` · `npm run build` · `npm run start`
- `npm run lint` (ESLint + `tsc --noEmit`) · `npm run test` (unit + reconciliación) · `npm run test:e2e`
- Red corporativa: `NODE_OPTIONS=--use-system-ca` para npm/Playwright.

## Arquitectura (flujo de datos)

`lib/excel` (lectura y parsers) → `lib/data/normalize-rows` + `build-dataset` (modelo `RiskRecord`)
→ `lib/validators/quality` → `lib/calculations` (funciones puras) → `hooks/use-dashboard-data`
(memo) → `components/*` vía `DashboardContext`. Filtros en `hooks/use-url-filters` (sincronizados con
la URL). Colores sólo desde `lib/theme/colors.ts`; formato sólo desde `lib/formatters/number.ts`.

## Reglas críticas (ver docs/data-audit.md)

- Filas = agregados. Contratos = Σ N_contratos, nunca contar filas.
- Snapshot = mes (`Año`/`Mes`); varias `fechatablon` por mes son aditivas.
- EAD/Provision/N_contratos son stocks: nunca sumar meses; KPI = último mes del rango.
- No sumar EAD_S1/S2/S3 con EAD (son EAD por stage de origen).
- Coverage = Σ Provision / Σ EAD sobre filas con EAD; división por 0 → null → "N/D". Nunca NaN/Infinity.
- Nulos ≠ 0: series con hueco, `null` en cálculos; EAD vacío ("No asignadas") no aporta importe.
- `Salida Cartera` es destino propio ("S"), nunca Stage 0.
- Último mes sin transiciones observables (`transitionObservable=false`): excluir de análisis de
  transición; con filtros de transición los KPI pasan al último mes observable.
- No usar datos mock fuera de `tests/unit`. No modificar el Excel de `data/`.

## Convenciones

- Textos de interfaz en español; formato `es-ES` con k€/M€/MM€.
- Cálculos en `lib/` como funciones puras con test en `tests/unit`; cualquier cambio de regla de
  negocio debe actualizar `docs/data-audit.md` y los tests de reconciliación.
- Componentes interactivos de gráficos: accesibles por teclado, `aria-label`, leyenda con texto.
