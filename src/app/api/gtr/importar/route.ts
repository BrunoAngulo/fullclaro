import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const run = promisify(execFile);
const MAX_FILE_SIZE = 30 * 1024 * 1024;
const GTR_ROOT = "C:\\Users\\bruno\\Documents\\Trabajo\\Full Claro";

function fechaLima() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function readResult(stdout: string) {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error("La importación no devolvió un resultado válido.");
  return JSON.parse(stdout.slice(start)) as Record<string, unknown>;
}

function importErrorDetail(error: unknown) {
  const failure = typeof error === "object" && error ? error as { stdout?: unknown; stderr?: unknown; message?: unknown } : {};
  for (const output of [failure.stdout, failure.stderr]) {
    if (typeof output !== "string" || !output.trim()) continue;
    try {
      const result = readResult(output);
      if (result.detalle) return String(result.detalle);
    } catch {
      // stderr may contain a non-JSON diagnostic from Python or SQL Server.
    }
  }
  const stderr = String(failure.stderr ?? "").trim();
  if (stderr) return `No se pudo procesar el archivo: ${stderr.replace(/\s+/g, " ").slice(0, 600)}`;
  const message = String(failure.message ?? "");
  if (/timed out|killed/i.test(message)) return "La importación tardó demasiado y se interrumpió. Vuelve a intentarlo; el archivo no se duplica.";
  return "La importación se interrumpió antes de finalizar. Vuelve a intentarlo; el archivo no se duplica.";
}

async function runCli(args: string[], options: Parameters<typeof run>[2]) {
  try {
    const result = await run("python", args, options);
    return readResult(String(result.stdout));
  } catch (error) {
    throw new Error(importErrorDetail(error));
  }
}

export async function POST(request: Request) {
  let folder = "";
  try {
    const form = await request.formData();
    const file = form.get("archivo");
    const soloDetectar = String(form.get("soloDetectar") ?? "") === "true";
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecciona el archivo Excel." }, { status: 400 });
    if (!/\.xlsx?$/i.test(file.name)) return NextResponse.json({ error: "Solo se aceptan archivos .xls o .xlsx." }, { status: 400 });
    if (!file.size || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "El archivo debe pesar entre 1 byte y 30 MB." }, { status: 400 });

    folder = await mkdtemp(path.join(tmpdir(), "gtr-fullclaro-"));
    const safeFilename = path.basename(file.name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
    const localFile = path.join(folder, safeFilename || `carga${path.extname(file.name).toLowerCase()}`);
    await writeFile(localFile, Buffer.from(await file.arrayBuffer()));
    const options = { cwd: GTR_ROOT, timeout: 180_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 };
    const detected = await runCli(["-m", "src.cli", "detectar", "--ruta", localFile], options);
    const tipo = String(detected.tipo ?? "");
    if (tipo !== "trazabilidad" && tipo !== "estados" && tipo !== "dotacion") throw new Error("El Excel no corresponde a Trazabilidad, Estados por asesor ni Dotación.");
    if (form.get("tipoEsperado") && String(form.get("tipoEsperado")) !== tipo) throw new Error("Selecciona un archivo de Dotación con la hoja AGENTES.");
    if (soloDetectar) return NextResponse.json({ Tipo: tipo, NombreArchivo: file.name });
    const args = ["-m", "src.cli", "importar", "--tipo", tipo, "--ruta", localFile];
    if (tipo === "dotacion") {
      const fecha = String(form.get("fechaVigencia") || fechaLima());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("La fecha de vigencia no es válida.");
      args.push("--fecha-vigencia", fecha, "--reprocesar");
    }
    const result = await runCli(args, options);
    if (result.Estado === "ERROR") throw new Error(String(result.detalle ?? "No se pudo importar el archivo."));
    return NextResponse.json({ ...result, Tipo: tipo, NombreArchivo: file.name });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo importar el archivo." }, { status: 400 });
  } finally {
    if (folder) await rm(folder, { recursive: true, force: true });
  }
}
