import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { db } from "@/lib/db";
import { parseReport, aggregate, groupRows } from "@/lib/report-parser";
import type {
  ReportDataset,
  ReportResponse,
  Metrics,
} from "@/lib/report-types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let cache: { id: number; data: ReportDataset } | null = null;
async function ensureTable() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS report_imports (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, filename VARCHAR(255) NOT NULL, digest CHAR(64) NOT NULL UNIQUE, payload LONGBLOB NOT NULL, imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
}
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx"))
      return NextResponse.json(
        { error: "Selecciona un archivo .xlsx." },
        { status: 400 },
      );
    if (!file.size || file.size > 35 * 1024 * 1024)
      return NextResponse.json(
        { error: "El Excel debe pesar entre 1 byte y 35 MB." },
        { status: 400 },
      );
    const buffer = Buffer.from(await file.arrayBuffer());
    const digest = createHash("sha256").update(buffer).digest("hex");
    await ensureTable();
    const [existing] = await db.query<RowDataPacket[]>(
      "SELECT id FROM report_imports WHERE digest=?",
      [digest],
    );
    if (existing.length)
      return NextResponse.json({
        id: Number(existing[0].id),
        message:
          "Este archivo ya estaba importado. Se conserva una sola copia.",
      });
    let data: ReportDataset;
    try {
      data = parseReport(buffer, file.name);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Excel no válido." },
        { status: 400 },
      );
    }
    const [result] = await db.execute<ResultSetHeader>(
      "INSERT INTO report_imports (filename,digest,payload) VALUES (?,?,?)",
      [file.name, digest, gzipSync(JSON.stringify(data))],
    );
    cache = { id: result.insertId, data };
    return NextResponse.json({
      id: result.insertId,
      message: `${data.rows.length.toLocaleString("es-PE")} registros importados.`,
      warnings: data.warnings,
    });
  } catch (e) {
    console.error("report import", e);
    return NextResponse.json(
      {
        error:
          "No se pudo guardar la reportería. Revisa que MySQL esté disponible.",
      },
      { status: 500 },
    );
  }
}
export async function GET(request: Request) {
  try {
    await ensureTable();
    const q = new URL(request.url).searchParams;
    const id = q.get("id");
    if (id && !/^\d+$/.test(id))
      return NextResponse.json(
        { error: "Importación inválida." },
        { status: 400 },
      );
    for (const key of ["from", "to"]) {
      const v = q.get(key);
      if (
        v &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
          Number.isNaN(Date.parse(v)) ||
          new Date(v).toISOString().slice(0, 10) !== v)
      )
        return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
    }
    if (q.get("from") && q.get("to") && q.get("from")! > q.get("to")!)
      return NextResponse.json(
        { error: "La fecha inicial debe ser anterior a la final." },
        { status: 400 },
      );
    const [imports] = await db.query<RowDataPacket[]>(
      "SELECT id,filename,imported_at FROM report_imports ORDER BY id DESC",
    );
    const entry = id ? imports.find((r) => String(r.id) === id) : imports[0];
    if (!entry)
      return id
        ? NextResponse.json(
            { error: "No existe esa importación." },
            { status: 404 },
          )
        : NextResponse.json({ empty: true, imports: [] });
    if (cache?.id !== Number(entry.id)) {
      const [stored] = await db.query<RowDataPacket[]>(
        "SELECT payload FROM report_imports WHERE id=?",
        [entry.id],
      );
      cache = {
        id: Number(entry.id),
        data: JSON.parse(gunzipSync(stored[0].payload).toString()),
      };
    }
    const dataset = cache.data;
    const dimensions = [
      "agent",
      "supervisor",
      "skill",
      "direction",
      "site",
      "mode",
      "condition",
    ] as const;
    const selected = dataset.rows.filter(
      (r) =>
        (!q.get("from") || r.date >= q.get("from")!) &&
        (!q.get("to") || r.date <= q.get("to")!) &&
        dimensions.every((k) => !q.get(k) || r[k] === q.get(k)),
    );
    const all = aggregate(dataset.rows);
    const result: ReportResponse = {
      id: Number(entry.id),
      filename: entry.filename,
      importedAt: entry.imported_at,
      totalRecords: dataset.rows.length,
      dates: [...new Set(dataset.rows.map((r) => r.date))].sort(),
      filters: Object.fromEntries(
        dimensions.map((k) => [
          k,
          [...new Set(dataset.rows.map((r) => r[k]))].sort(),
        ]),
      ),
      kpis: aggregate(selected),
      daily: groupRows(selected, "date"),
      agents: groupRows(selected, "agent").sort(
        (a, b) => b.answered - a.answered,
      ),
      supervisors: groupRows(selected, "supervisor"),
      slots: groupRows(selected, "slot"),
      skills: groupRows(selected, "skill"),
      directions: groupRows(selected, "direction"),
      sheets: dataset.sheets,
      warnings: dataset.warnings,
      reconciliation: Object.entries(dataset.control).map(
        ([metric, source]) => ({
          metric,
          source,
          calculated: Number(all[metric as keyof Metrics]),
          matches:
            all[metric as keyof Metrics] !== null &&
            Math.abs(Number(all[metric as keyof Metrics]) - source) < 0.00001,
        }),
      ),
    };
    return NextResponse.json(
      {
        ...result,
        imports: imports.map((r) => ({
          id: Number(r.id),
          filename: r.filename,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("report read", e);
    return NextResponse.json(
      {
        error:
          "No se pudo consultar la reportería. Revisa la conexión con MySQL.",
      },
      { status: 503 },
    );
  }
}
