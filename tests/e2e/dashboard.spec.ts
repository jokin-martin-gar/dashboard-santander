import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const EXCEL = path.resolve(__dirname, "../../data/BBDD.xlsx");

/** Registra errores de consola y excepciones para comprobar que no hay ninguno. */
function trackConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function openDashboard(page: Page, query = "") {
  await page.goto(`/${query}`);
  await expect(page.getByTestId("kpi-cards")).toBeVisible({ timeout: 60_000 });
}

async function noHorizontalOverflow(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw).toBeLessThanOrEqual(cw);
}

test("carga la aplicación y procesa el Excel predeterminado", async ({ page }) => {
  const errors = trackConsole(page);
  await openDashboard(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dashboard de Riesgo y Transiciones");
  await expect(page.getByTestId("source-info")).toContainText("BBDD.xlsx");
  await expect(page.getByTestId("records-count")).toContainText("11.735 registros");
  await expect(page.getByTestId("reference-date")).toContainText("junio de 2026");
  // KPI reconciliados con docs/data-audit.md
  await expect(page.getByTestId("kpi-ead-value")).toHaveText("282 MM€");
  await expect(page.getByTestId("kpi-contratos-value")).toHaveText("6.561.155");
  await expect(page.getByTestId("kpi-coverage-value")).toHaveText("0,95 %");
  await expect(page.getByTestId("kpi-deteriorado-value")).toHaveText("2,33 MM€");
  await expect(page.getByTestId("transition-notice")).toBeVisible();
  await expect(page.getByText(/\bNaN\b/)).toHaveCount(0);
  await expect(page.getByText(/\bInfinity\b/)).toHaveCount(0);
  await noHorizontalOverflow(page);
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test("los filtros actualizan KPI, gráficos, tabla y URL", async ({ page }) => {
  const errors = trackConsole(page);
  await openDashboard(page);
  const eadBefore = await page.getByTestId("kpi-ead-value").textContent();
  const rangeBefore = await page.getByTestId("table-range").textContent();

  await page.getByTestId("filter-cartera").click();
  await page.locator("label", { hasText: "02. Hipotecas" }).click();
  await page.keyboard.press("Escape");

  await expect(page.getByTestId("active-filters")).toContainText("Cartera: 02. Hipotecas");
  await expect(page.getByTestId("kpi-ead-value")).not.toHaveText(eadBefore!);
  await expect(page.getByTestId("table-range")).not.toHaveText(rangeBefore!);
  await expect(page.getByTestId("stage-bar-1")).toBeVisible();
  await expect(page).toHaveURL(/cartera=02\.\+Hipotecas|cartera=02\.%20Hipotecas/);

  // Eliminar el filtro individualmente
  await page.getByRole("button", { name: "Quitar filtro Cartera: 02. Hipotecas" }).click();
  await expect(page.getByTestId("kpi-ead-value")).toHaveText(eadBefore!);
  expect(errors).toEqual([]);
});

test("los filtros se restauran desde la URL", async ({ page }) => {
  await openDashboard(page, "?desde=2025-01&hasta=2025-12&origen=2");
  await expect(page.getByTestId("reference-date")).toContainText("diciembre de 2025");
  await expect(page.getByTestId("active-filters")).toContainText("Origen: Stage 2");
  await expect(page.getByTestId("active-filters")).toContainText("Período: ene 2025 – dic 2025");
});

test("el rango de fechas usa el último mes para los KPI", async ({ page }) => {
  await openDashboard(page);
  await page.getByTestId("period-from").first().selectOption("2025-01");
  await expect(page.getByTestId("reference-date")).toContainText("junio de 2026");
  await expect(page.getByTestId("reference-date")).toContainText("rango de 18 meses");
  await expect(page.getByTestId("kpi-ead-value")).toHaveText("282 MM€");
});

test("el Sankey y la matriz responden y filtran la transición", async ({ page }) => {
  const errors = trackConsole(page);
  await openDashboard(page);
  const link = page.getByTestId("sankey-link-1-2");
  await expect(link).toBeVisible();
  await link.hover();
  await expect(page.getByRole("tooltip").filter({ hasText: "% EAD de Stage 1" })).toBeVisible();
  await link.click();
  await expect(page.getByTestId("active-filters")).toContainText("Transición: Stage 1 → Stage 2");
  await expect(page.getByTestId("matrix-cell-1-2")).toHaveAttribute("aria-pressed", "true");
  // Con filtro de transición, los KPI se refieren al último mes observable (may 2026)
  await expect(page.getByTestId("kpi-ead")).toContainText("may 2026");

  // La matriz cambia de métrica y desactiva el filtro al pulsar
  await page.getByTestId("section-matrix").getByRole("radio", { name: "Coverage" }).click();
  await expect(page.getByTestId("matrix-cell-1-2")).toContainText("%");
  await page.getByTestId("matrix-cell-1-2").click();
  await expect(page.getByTestId("active-filters")).toHaveCount(0);

  // Ocultar permanencias elimina el flujo 1-1
  await page.getByTestId("toggle-permanence").uncheck();
  await expect(page.getByTestId("sankey-link-1-1")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("la tabla pagina, ordena y busca", async ({ page }) => {
  await openDashboard(page);
  const table = page.getByTestId("detail-table");
  await expect(page.getByTestId("table-range")).toContainText("1–25 de 129");
  await page.getByTestId("page-next").click();
  await expect(page.getByTestId("table-range")).toContainText("26–50 de 129");

  // Orden ascendente por EAD: la primera fila pasa a ser la de menor EAD
  await page.getByTestId("sort-ead").click();
  await expect(table.locator("th[aria-sort='ascending']")).toContainText("EAD");
  // Búsqueda
  await page.getByTestId("table-search").fill("Hipotecas");
  await expect(page.getByTestId("table-range")).toContainText("de 9 filas");
  await expect(table.locator("tbody tr").first()).toContainText("02. Hipotecas");

  // Detalle de fila: valor original vs normalizado
  await table.locator("tbody tr").first().click();
  await expect(page.getByRole("dialog")).toContainText("Valor original de cada celda");
  await expect(page.getByRole("dialog")).toContainText("fechatablon");
});

test("la exportación genera ficheros", async ({ page }) => {
  await openDashboard(page);
  await page.getByTestId("table-export").click();
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByTestId("table-export-xlsx").click()]);
  expect(xlsx.suggestedFilename()).toMatch(/^detalle_filtrado_.*\.xlsx$/);

  await page.getByTestId("export-filtered").click();
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  const content = await (await csv.createReadStream())!.toArray();
  const text = Buffer.concat(content).toString("utf8");
  expect(text.split("\r\n")).toHaveLength(130); // cabecera + 129 filas de jun 2026
  expect(text).toContain("Fila_Excel;Periodo;fechatablon;Cartera");
});

test("panel de calidad de datos", async ({ page }) => {
  await openDashboard(page);
  await page.getByTestId("open-quality").click();
  const panel = page.getByTestId("quality-panel");
  await expect(panel).toContainText("Filas cargadas");
  await expect(panel).toContainText("11.735");
  await expect(panel).toContainText("N_contratos anómalo en ago 2024");
  await expect(panel).toContainText("Transiciones no observables");
});

test("carga de Excel: archivo inválido y archivo válido", async ({ page }) => {
  const errors = trackConsole(page);
  await openDashboard(page);
  await page.getByTestId("open-upload").click();
  const input = page.getByTestId("upload-input");
  await input.setInputFiles({ name: "datos.txt", mimeType: "text/plain", buffer: Buffer.from("hola") });
  await expect(page.getByTestId("upload-error")).toContainText("Formato no admitido");
  await input.setInputFiles({ name: "roto.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("no es un excel") });
  await expect(page.getByTestId("upload-error")).toBeVisible();
  // El dashboard sigue funcionando con los datos previos
  await expect(page.getByTestId("kpi-ead-value")).toHaveText("282 MM€");

  await input.setInputFiles(EXCEL);
  await expect(page.getByTestId("upload-dialog")).toContainText("BBDD.xlsx cargado");
  await page.getByRole("button", { name: "Ver dashboard" }).click();
  await expect(page.getByTestId("source-info")).toContainText("cargado en sesión");
  expect(errors).toEqual([]);
});

test.describe("móvil", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("la vista móvil es usable", async ({ page }) => {
    const errors = trackConsole(page);
    await openDashboard(page);
    await noHorizontalOverflow(page);
    await expect(page.getByTestId("sankey-mobile")).toBeVisible();
    await page.getByTestId("open-filters").click();
    await expect(page.getByRole("dialog")).toContainText("Filtros");
    await page.getByRole("dialog").getByTestId("filter-origen").click();
    await page.locator("label", { hasText: "Stage 3" }).click();
    await expect(page.getByRole("checkbox", { name: "Stage 3" })).toBeChecked();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Ver resultados" }).click();
    await expect(page.getByTestId("active-filters")).toContainText("Origen: Stage 3");
    await noHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
});
