import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDimensionWorkbook } from "@/lib/excel-parser";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function periodBounds(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const requestedCampaign = String(formData.get("campaign") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecciona un archivo Excel." }, { status: 400 });
    }
    if (!/\.xlsx$/i.test(file.name)) {
      return NextResponse.json({ error: "El archivo debe tener extensión .xlsx." }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "El archivo debe pesar entre 1 byte y 10 MB." }, { status: 400 });
    }

    const content = Buffer.from(await file.arrayBuffer());
    const parsed = parseDimensionWorkbook(content);
    const campaignName = (requestedCampaign || parsed.campaignName).toUpperCase();
    const { start, end } = periodBounds(parsed.periodMonth);
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();
      const [importResult] = await connection.execute<import("mysql2").ResultSetHeader>(
        `INSERT INTO dimension_imports
          (campaign_name, period_month, original_filename, content_type, file_size, file_content, total_rows, warnings)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [campaignName, parsed.periodMonth, file.name, file.type || null, file.size, content, parsed.rows.length, JSON.stringify(parsed.warnings)],
      );

      await connection.execute(
        `DELETE FROM dimension_intervals
         WHERE campaign_name = ? AND service_date >= ? AND service_date < ?`,
        [campaignName, start, end],
      );

      const values = parsed.rows.map((row) => [
        importResult.insertId,
        campaignName,
        row.serviceDate,
        row.timeSlot,
        row.plannedCalls,
        row.plannedTmgSeconds,
        row.requiredAdvisors,
        row.plannedHours,
      ]);
      await connection.query(
        `INSERT INTO dimension_intervals
          (import_id, campaign_name, service_date, time_slot, planned_calls, planned_tmg_seconds, required_advisors, planned_hours)
         VALUES ?`,
        [values],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return NextResponse.json({
      campaignName,
      periodMonth: parsed.periodMonth,
      importedRows: parsed.rows.length,
      warnings: parsed.warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo importar el archivo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
