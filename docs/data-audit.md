# Auditoría de datos — `data/BBDD.xlsx`

Fecha de auditoría: 05/10/2026. Cifras obtenidas con el propio pipeline de la aplicación y verificadas
con un cálculo independiente en `tests/reconciliation/excel-reconciliation.test.ts`.

## 1. Estructura real del Excel

| Elemento | Valor |
|---|---|
| Archivo | `BBDD.xlsx` (1,85 MB). Copia idéntica (SHA-256 `62DC6D24…E831`) del original, que no se modifica |
| Hojas | 1: `BBDD` (rango `A1:T11736`, definida como tabla de Excel `BBDD`) |
| Filas de datos | **11.735** (+ 1 fila de encabezados) |
| Columnas | 20 — coinciden con las esperadas |
| Duplicados exactos | 0 |
| Duplicados de clave (fecha, cartera, titulizado, flag, transición) | 0 |
| Fechas (`fechatablon`) | mín. **31/01/2023**, máx. **30/06/2026** (84 fechas distintas) |
| Meses (`Año`/`Mes`) | **42** (ene 2023 → jun 2026), sin huecos |

### Columnas y tipos

| Columna | Tipo real | Nulos | Observaciones |
|---|---|---|---|
| `N_contratos` | entero | 0 | 1 – 3.072.056. **Medida agregada** (contratos por fila) |
| `fechatablon` | serial Excel (número) | 0 | Formato de celda `yyyy-mm-dd` |
| `Año`, `Mes` | entero | 0 | Coinciden siempre con `fechatablon` |
| `Cartera` | texto | 0 | 20 valores: `01. Carterizadas` … `19. Personalizados` y `No asignadas` |
| `titulizado` | texto | 0 | `N` (10.827), `S` (908) |
| `flag_individualizado` | texto | 0 | `N` (10.014), `S` (1.072), **`VE` (649)** — significado no documentado |
| `stage` | entero | 0 | 1, 2, 3 |
| `stage_despues` | entero | **3.177** | 1, 2, 3; vacío ⇔ `Transiciones` = `n-Salida Cartera` |
| `Transiciones` | texto | 0 | 12 valores: `1-1 … 3-3` y `1/2/3-Salida Cartera` |
| `EAD` | decimal | **506** | Vacío sólo en `Cartera = No asignadas` (todas sus filas) |
| `Provision` | decimal | 0 | 0 – 878,5 M€ |
| `tiempo_en_cartera` | decimal (días) | 0 | p50 = 1.963 días; máx. 82.725 días (226 años) |
| `tiempo_a_vencimiento` | decimal (días) | 0 | p50 = 373 días; máx. 1.503.725 días (≈4.100 años) |
| `años_ttm` | decimal (años) | 0 | 1 – 47; 32 % enteros |
| `Año_Transiciones`, `Mes_Transiciones` | entero | 0 | Siempre = mes siguiente a `Año`/`Mes` |
| `EAD_S1`, `EAD_S2`, `EAD_S3` | **fórmula** | 0 | `=IF([stage]=x,[EAD],0)` — muestran `-` como formato de 0 |

### Formato regional

- Todos los números están almacenados como **números nativos** (no texto). El formato visible
  (`" 40,852,201,826.68 "`, `" -   "`) es sólo formato de celda contable; el valor real es correcto.
- Las **celdas de encabezado también tienen formato contable**: su texto formateado incluye espacios
  (`" EAD "`, `" N_contratos "`). Una lectura ingenua por texto formateado produce claves con
  espacios; la aplicación lee el valor bruto y normaliza (trim, minúsculas, sin acentos, `_`).
- Fechas: seriales de Excel (sistema 1900).

## 2. Interpretaciones adoptadas

### 2.1 Granularidad: cada fila es un agregado, no un contrato

La clave única es (mes, `fechatablon`, `Cartera`, `titulizado`, `flag_individualizado`, `Transiciones`).
`N_contratos` es el número de contratos agregados en la fila ⇒ **contratos = SUM(N_contratos)**, nunca
COUNT(filas).

### 2.2 El snapshot es el mes (`Año`/`Mes`), no `fechatablon`

Desde oct-2024 cada mes contiene **tres fechas de corte** (p. ej. jun-2025: 04/06, 27/06 y 30/06) que
corresponden a **subconjuntos distintos** de subcarteras (5, 19 y 40 combinaciones respectivamente) y
que son **aditivos**: la suma de las tres fechas da un stock mensual continuo con los meses anteriores
(EAD sep-24 248,8 MM€ → oct-24 248,9 MM€). Por tanto:

- El filtro de fecha trabaja por **mes**. `fechatablon` se conserva en la tabla y en la exportación.
- La "fecha de referencia" mostrada es el mes y su `fechatablon` máxima (30/06/2026).

### 2.3 Transiciones

Cada fila del mes *m* describe contratos en `stage` en *m* y su stage en *m+1* (`stage_despues`,
`Año_Transiciones`/`Mes_Transiciones`). Las métricas (`EAD`, `Provision`, `N_contratos`) están medidas
**en el mes de origen *m***; incluso las filas `Salida Cartera` tienen EAD (el que tenían antes de
salir). En consecuencia:

- Σ EAD de todas las transiciones de *m* = **stock de EAD de *m***.
- Los flujos se valoran a EAD de origen; no son el EAD del mes de destino.
- `Salida Cartera` se mantiene como **nodo propio** (no se convierte en Stage 0).

Coherencia `stage` / `stage_despues` / `Transiciones`: **0 inconsistencias** en 11.735 filas.

### 2.4 El último mes (jun-2026) no tiene transiciones observables

Las 129 filas de jun-2026 figuran **todas** como `n-Salida Cartera` porque jul-2026 no existe en el
fichero (las demás meses tienen ~330 filas y las 12 transiciones). Son un artefacto de construcción:

- Su **stock** (EAD 282,26 MM€, provisión 2,69 MM€, 6.561.155 contratos) es válido y se usa en los KPI.
- Se **excluyen** de Sankey, matriz, calidad de cartera y EAD deteriorado. Esos bloques usan el
  **último mes con transiciones observables** (may-2026 → jun-2026) y lo indican explícitamente.
- Si el usuario activa filtros de transición (destino, tipo o transición concreta), los KPI pasan a
  ese mismo mes observable, porque el destino de jun-2026 es desconocido.

### 2.5 EAD_S1 / EAD_S2 / EAD_S3

Son fórmulas `IF(stage = x, EAD, 0)`: EAD repartido por **stage de origen**. Se cumple en 11.229 de
11.229 filas con EAD. **No se suman** a `EAD` (duplicaría). La aplicación usa `EAD` + `stage` y sólo
valida la coherencia de estas columnas (aviso `ead_split_mismatch` si no cuadran: 0 casos).

### 2.6 EAD vacío en "No asignadas"

Las 506 filas de `No asignadas` tienen `EAD` vacío pero `Provision` (6,2 M€ en total) y `N_contratos`
(102.269 en total) informados. No se interpreta el vacío como 0 € de exposición:

- Se excluyen de SUM(EAD) (equivale a no aportar importe) y se señalan como advertencia.
- **Coverage ratio** = SUM(Provision) / SUM(EAD) **sobre filas con EAD informado** (mismo universo en
  numerador y denominador). Impacto de incluir su provisión en jun-2026 (0,26 M€ sobre 282 MM€ de EAD):
  < 0,0001 p.p. de coverage.
- Sí se incluyen en Provisión total y Nº de contratos.
- Su coverage individual se muestra como N/D.

### 2.7 Tiempos

- `tiempo_en_cartera` y `tiempo_a_vencimiento` están en **días** (en contratos individuales
  `años_ttm = máx(1, ⌈días/365⌉)` en el 92 % de los casos). En el dashboard se muestran en años
  (días / 365,25).
- `años_ttm` son años a vencimiento redondeados al alza con mínimo 1.
- Son **medias por fila**; la aplicación calcula **medias ponderadas por EAD** entre filas (aproximación:
  se desconoce la ponderación interna de cada fila) y **medianas ponderadas por EAD**.
- Atípicos > 100 años: 245 filas (tiempos de hasta 4.100 años). Se excluyen de la **media** (no de la
  mediana ni de los histogramas, donde caen en el último rango abierto). Su EAD es residual: la media
  apenas cambia (13,27 años de antigüedad con o sin ellos).

## 3. Problemas de calidad encontrados

| # | Problema | Alcance | Tratamiento |
|---|---|---|---|
| 1 | `EAD` vacío | 506 filas (`No asignadas`, 4,3 %) | Excluidas de EAD y coverage; aviso |
| 2 | Transiciones del último mes no observables | 129 filas (jun-2026) | Excluidas de análisis de transición; aviso visible |
| 3 | **N_contratos anómalo** ago-2024 (11.625.580; ×1,96 la mediana vecina) y sep-2024 (1.514.849; ×0,25). P. ej. Hipotecas: 773k → 4,19M → 2.846 → 1,10M, con EAD estable | 2 meses | Se muestran tal cual, con marca de anomalía en el gráfico temporal y en el panel de calidad. **No se corrigen** |
| 4 | Varias `fechatablon` por mes | 21 meses (oct-24 → jun-26) | Agregadas al mes |
| 5 | Tiempos atípicos (> 100 años) | 245 filas | Excluidos de la media ponderada; aviso informativo |
| 6 | `flag_individualizado = VE` | 649 filas | Se conserva como categoría propia; significado a confirmar |
| 7 | `años_ttm` incoherente con `tiempo_a_vencimiento` en filas agregadas (Carterizadas: 7,25 años vs 2,26) | 967 filas con `años_ttm` < días/365,25 | Se muestran ambas métricas; ver §6 |
| 8 | 1 fila con Provision > EAD por 1,2·10⁻⁷ € (19. Personalizados, 2-1) | 1 fila | Ruido de coma flotante (tolerancia relativa 10⁻⁶); no se marca |
| 9 | Encabezados con formato contable (texto formateado con espacios) | 11 encabezados | Normalización de encabezados |
| 10 | 115 filas con EAD = 0 y 251 con Provision = 0 | — | Valores válidos (0 ≠ vacío) |

No hay filas descartadas, duplicadas, ni transiciones incoherentes.

## 4. Transformaciones realizadas (en memoria, el Excel no se modifica)

1. Lectura con SheetJS de valores **brutos** (`raw: true`), detección de la hoja más probable
   (más columnas reconocidas) y de la fila de encabezados (primeras 20 filas).
2. Normalización de encabezados: trim, NFD sin diacríticos (`Año` → `ano`), minúsculas, espacios /
   guiones / puntos → `_`. Alias tolerados (ver `lib/excel/headers.ts`). Encabezado duplicado → se
   usa la primera aparición y se informa.
3. Números: nativos o texto en formato español/internacional; la convención de cada columna se infiere
   de sus valores de texto inequívocos. Porcentajes en texto → fracción. Marcadores de nulo
   (`""`, `-`, `–`, `—`, `null`, `N/A`, `#N/A`, `n.d.`…) → `null` (nunca 0).
4. Fechas: serial Excel (con el bug del 29/02/1900), `Date`, `yyyy-mm-dd`, `dd/mm/yyyy`.
5. Período = `Año`-`Mes` (si faltan, se deriva de `fechatablon`; si discrepan, aviso).
6. Transición: origen = `stage`; destino = `Transiciones` (tolerante a guiones tipográficos,
   mayúsculas, `S1-S2`, `salida de cartera`…), con `stage_despues` como respaldo. Clave canónica
   `1-2`, `3-S`.
7. Clasificación: Permanencia (1-1, 2-2, 3-3), Deterioro (1-2, 1-3, 2-3), Cura (2-1, 3-2, 3-1),
   Salida (n-S).
8. Cálculo de `transitionObservable` (existe el mes de destino en el fichero).
9. Validaciones y advertencias por fila; informe de calidad.

## 5. Reglas de cálculo

| Métrica | Fórmula |
|---|---|
| EAD total | Σ EAD (filas con EAD) del **mes de referencia** |
| Provisión total | Σ Provision del mes de referencia |
| Nº de contratos | Σ N_contratos del mes de referencia |
| Coverage ratio | Σ Provision / Σ EAD sobre filas con EAD; denominador 0 → N/D |
| EAD deteriorado | Σ EAD de transiciones 1-2, 1-3, 2-3 en el último mes observable ≤ referencia |
| Variación | vs. mes **anterior disponible** en el fichero; absoluta y relativa (coverage: p.p. y %); N/D si no existe |
| Mes de referencia | último mes del rango seleccionado (por defecto, el último del fichero). Nunca se suman meses |
| % EAD de origen (Sankey) | EAD de la transición / EAD total de su stage de origen (mismo mes y filtros) |
| Tasa de deterioro | EAD(1-2,1-3,2-3) / EAD con origen Stage 1 o 2 (incluidas sus salidas) |
| Tasa de cura | EAD(2-1,3-2,3-1) / EAD con origen Stage 2 o 3 (incluidas sus salidas) |
| Medias de tiempo | media ponderada por EAD excluyendo valores > 100 años; mediana ponderada por EAD |
| Rangos de antigüedad | cuantiles ponderados por EAD (p10, p25, p50, p75, p90) de **todo el fichero**, redondeados; estables al filtrar |
| Series temporales | un punto por mes; mes sin datos tras filtros → hueco (null), nunca 0 |

**Alternativas documentadas para el EAD deteriorado** (no implementadas como definición por defecto):
(a) incluir 1-3 sólo como "default directo"; (b) usar EAD de destino en *m+1* (no disponible en el
fichero); (c) deterioro neto = deterioro − cura (may-26: 2,33 MM€ − 2,59 MM€ = −0,26 MM€). La
aplicación muestra deterioro y cura por separado para no ocultar ninguno de los dos.

**Tasas**: se eligió como denominador el EAD de origen *susceptible* (Stage 1-2 para deterioro,
Stage 2-3 para cura) en lugar del EAD total, porque Stage 3 no puede deteriorarse y Stage 1 no puede
curarse: con el EAD total la tasa de cura quedaría diluida por el 95 % de la cartera en Stage 1.

## 6. Comprobaciones de reconciliación

Todas automatizadas (`npm run test`). Resultado: **todas superadas**.

| Comprobación | Resultado |
|---|---|
| Filas leídas = filas de la hoja (11.735), 0 descartadas | ✔ |
| Σ EAD, Σ Provision, Σ N_contratos por mes (42 meses) = cálculo independiente sobre la hoja | ✔ (tolerancia 0,005 €) |
| Σ por stage = total del mes; Σ EAD stage x = Σ EAD_Sx | ✔ 42 meses |
| Σ de las 12 transiciones = total del mes (EAD, contratos, provisión) | ✔ 41 meses observables |
| EAD por transición = Σ EAD de la hoja con ese texto en `Transiciones` | ✔ |
| Σ por clase de transición = total | ✔ |
| Σ por cartera = total | ✔ |
| EAD deteriorado = Σ EAD (1-2,1-3,2-3) de la hoja | ✔ |

Cifras de referencia (jun-2026, sin filtros):

| KPI | Valor | Mes anterior (may-2026) | Variación |
|---|---|---|---|
| EAD total | 282.261.624.983,10 € | 279.911.655.205,09 € | +2,35 MM€ (+0,84 %) |
| Provisión total | 2.685.306.314,92 € | 2.720.462.832,26 € | −35,2 M€ (−1,29 %) |
| Nº contratos | 6.561.155 | 6.556.712 | +4.443 (+0,07 %) |
| Coverage ratio | 0,95 % | 0,97 % | −0,02 p.p. |
| EAD deteriorado (may→jun 26) | 2.332.618.619,31 € | 2.200.185.909,45 € (abr→may) | +6,02 % |
| Tasa de deterioro (may→jun 26) | 0,85 % | | |
| Tasa de cura (may→jun 26) | 15,83 % | | |

## 7. Decisiones que debe revisar una persona experta en riesgo

1. Excluir `No asignadas` del EAD y del coverage (EAD vacío) en lugar de imputar 0.
2. Valorar los flujos a EAD de origen (único dato disponible).
3. Denominadores de las tasas de deterioro y cura (EAD susceptible, incluidas salidas).
4. Tratamiento de jun-2026 (stock válido, transiciones no observables).
5. Meses con N_contratos anómalo (ago/sep-2024): se muestran sin corregir.
6. Significado de `flag_individualizado = VE`.
7. Base de promediado de `tiempo_a_vencimiento` vs `años_ttm` en filas agregadas (§3, punto 7).
8. Medias de tiempos ponderadas por EAD sobre medias de fila (aproximación) y umbral de 100 años
   para atípicos.
