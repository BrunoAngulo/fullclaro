import { NextResponse } from "next/server";
import { executeGtr } from "@/lib/gtr-sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const fecha = new URL(request.url).searchParams.get("fecha") ?? "2026-10-21";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha))
    return NextResponse.json({ error: "La fecha debe tener formato AAAA-MM-DD." }, { status: 400 });
  try {
    const [tramos, modalidad, asesores, encuestas, objetivos] = await Promise.all([
      executeGtr("mart.sp_ReportePBIXTramos", fecha, { DesdeMinuto: 0, HastaMinuto: 1440 }),
      executeGtr("mart.sp_ReportePBIXModalidad", fecha),
      executeGtr("mart.sp_ReporteAsesoresSupervisor", fecha),
      executeGtr("mart.sp_ResumenTNPS", fecha),
      executeGtr("mart.sp_EvaluarObjetivosResumen", fecha),
    ]);
    const resumen = tramos.find((row) => row.Tramo === "Total") ?? null;
    return NextResponse.json({ fecha, resumen, tramos, modalidad, asesores, encuestas: encuestas[0] ?? null, objetivos }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GTR SQL", error);
    return NextResponse.json({ error: "No se pudo consultar GTR_FullClaro. Revisa SQL Server local." }, { status: 503 });
  }
}
