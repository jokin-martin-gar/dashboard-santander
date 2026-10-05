import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Sirve el Excel predeterminado de la carpeta `data/` para que el navegador lo procese.
 * Se lee en cada petición: sustituir el archivo en `data/` no requiere recompilar.
 * Prioridad: BBDD.xlsx; si no existe, el primer .xlsx/.xls por orden alfabético.
 */
export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "data");

async function findDefaultFile(): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(DATA_DIR);
  } catch {
    return null;
  }
  const excel = entries.filter((f) => /\.(xlsx|xls|xlsm)$/i.test(f) && !f.startsWith("~$")).sort();
  if (!excel.length) return null;
  return excel.find((f) => f.toLowerCase() === "bbdd.xlsx") ?? excel[0];
}

export async function GET() {
  const name = await findDefaultFile();
  if (!name) {
    return Response.json(
      { error: "not_found", message: "No hay ningún archivo Excel en la carpeta data/ del proyecto." },
      { status: 404 },
    );
  }
  const filePath = path.join(DATA_DIR, name);
  const [buf, info] = await Promise.all([readFile(filePath), stat(filePath)]);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Cache-Control": "no-store",
      "X-File-Name": encodeURIComponent(name),
      "X-File-Modified": info.mtime.toISOString(),
    },
  });
}
