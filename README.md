# Dashboard de Riesgo y Transiciones

Dashboard ejecutivo para analizar riesgo de crédito, exposición (EAD), provisiones y transiciones entre
stages a partir del Excel real de `data/`. Todo el procesamiento se hace en el navegador: el Excel no
se envía a ningún servicio externo.

## Requisitos

- Node.js ≥ 20.9 (probado con 22.23 LTS) y npm.
- Navegador moderno (Chrome, Edge, Firefox, Safari).
- Para los tests E2E: el navegador de Playwright (`npx playwright install chromium`).

> Redes corporativas con inspección TLS: si `npm install` falla con `SELF_SIGNED_CERT_IN_CHAIN`,
> ejecute `$env:NODE_OPTIONS="--use-system-ca"` (PowerShell) o `export NODE_OPTIONS=--use-system-ca`
> para que Node use los certificados del sistema. No desactive `strict-ssl`.

## Instalación y uso

```bash
npm install
npm run dev          # http://localhost:3000
```

Producción:

```bash
npm run build
npm run start        # http://localhost:3000
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm run start` | Compilación y servidor de producción |
| `npm run lint` | ESLint + comprobación de tipos (`tsc --noEmit`, modo strict) |
| `npm run test` | Tests unitarios y de reconciliación con el Excel real (Vitest) |
| `npm run test:e2e` | Tests end-to-end (Playwright; arranca `next dev` en el puerto 3210) |

## El Excel

- **Ubicación esperada**: `data/BBDD.xlsx`. Si no existe, se usa el primer `.xlsx`/`.xls` de `data/`
  por orden alfabético. Se sirve en `/api/default-excel` y se lee en cada petición.
- **Sustituirlo de forma permanente**: reemplace el archivo en `data/` y pulse *Recargar* (no hace falta
  recompilar).
- **Sustituirlo en la sesión**: botón *Cargar Excel* (arrastrar y soltar o seleccionar). Se valida el
  formato, se elige automáticamente la hoja más probable (permite cambiarla), se validan las columnas y
  se muestra un resumen de filas válidas / descartadas / con advertencias. Si falla, se conservan los
  datos anteriores. *Restaurar el Excel predeterminado* vuelve a `data/`.
- Columnas requeridas: `N_contratos`, `fechatablon` (o `Año` + `Mes`), `Cartera`, `stage`,
  `Transiciones` (o `stage_despues`), `EAD`, `Provision`. El resto son opcionales. Los encabezados se
  normalizan (espacios, mayúsculas, acentos, guiones; duplicados → primera aparición).
- El Excel original nunca se modifica.

## Reglas de cálculo

Detalle completo y justificación en [`docs/data-audit.md`](docs/data-audit.md).

- Cada fila es un **agregado** (mes × subcartera × transición). Contratos = **Σ N_contratos**.
- El snapshot es el **mes** (`Año`/`Mes`); un mes puede tener varias `fechatablon` de corte (aditivas).
- **EAD, provisión y contratos son stocks**: nunca se suman entre meses. Por defecto se muestra el
  último mes; con un rango, los KPI muestran el **último mes del rango**. Los gráficos temporales
  muestran cada mes.
- **Coverage ratio** = Σ Provision / Σ EAD sobre filas con EAD informado; denominador 0 → `N/D`.
- **EAD deteriorado** = Σ EAD de las transiciones 1-2, 1-3, 2-3.
- **Tasa de deterioro** = EAD(1-2, 1-3, 2-3) / EAD con origen Stage 1-2.
  **Tasa de cura** = EAD(2-1, 3-2, 3-1) / EAD con origen Stage 2-3.
- % del EAD de origen (Sankey) = EAD de la transición / EAD total de su stage de origen.
- `EAD_S1/S2/S3` son `IF(stage=x, EAD, 0)`: no se suman a `EAD` (duplicaría); sólo se validan.
- `Salida Cartera` es un destino propio (nunca "Stage 0").
- El último mes del fichero no tiene transiciones observables: su stock es válido, pero los análisis de
  transición usan el último mes observable y lo indican.
- Medias de tiempos ponderadas por EAD (excluyendo valores > 100 años) y medianas ponderadas.
- Variaciones frente al mes anterior disponible; sin mes anterior → `N/D`.
- Formato español: `k€`, `M€`, `MM€` (miles de millones); valor completo en tooltip.

## Funcionalidades

KPI con variación mensual · filtros globales (período, cartera, titulizado, individualizado, stage de
origen y destino, tipo de transición) sincronizados con la URL y con chips eliminables · Sankey
interactivo (EAD / contratos, ocultar permanencias, clic para filtrar, lista alternativa en móvil) ·
matriz de transiciones con totales · evolución mensual (total, por stage, comparación, zoom, tabla de
datos) · distribución por stage · calidad de cartera con tasas y su evolución · antigüedad y
vencimiento por rangos derivados de los datos · tabla de detalle (búsqueda, orden, columnas,
paginación, valores originales vs normalizados, exportación XLSX/CSV) · panel de calidad de datos.

## Estructura

```
app/                    página, layout, estilos y ruta /api/default-excel
components/
  dashboard/            orquestador, cabecera, KPI, bloques, panel de calidad, carga
  charts/               Sankey (d3-sankey), matriz, serie temporal, distribución, utilidades
  filters/              barra de filtros, selector múltiple, período
  tables/               tabla de detalle (TanStack Table v9) y detalle de fila
  ui/                   componentes shadcn/ui (Base UI)
hooks/                  carga del dataset, filtros en URL, datos derivados
lib/
  excel/                lectura (SheetJS), encabezados, parsers de valores
  data/                 normalización, construcción del dataset, transiciones, períodos, URL
  validators/           informe de calidad
  calculations/         filtros, métricas, agregaciones, antigüedad
  formatters/           formato numérico español
  export/               exportación XLSX / CSV
  theme/                paleta única de colores
types/                  modelo de datos y filtros
tests/                  unit/ (datos sintéticos aislados), reconciliation/ (Excel real), e2e/
data/                   Excel predeterminado
docs/                   auditoría de datos
```

## Limitaciones conocidas

- El Excel se procesa en el hilo principal (≈0,2 s para 11.735 filas); para ficheros mucho mayores
  convendría un Web Worker.
- Los flujos de transición se valoran a EAD del mes de origen (es el único dato disponible).
- Las medias de tiempos son medias ponderadas de medias de fila (se desconoce la ponderación interna).
- N_contratos de ago-2024 y sep-2024 es anómalo en origen; se muestra marcado, sin corregir.
- Sólo modo claro.
- La carga en sesión no persiste al recargar la página.
