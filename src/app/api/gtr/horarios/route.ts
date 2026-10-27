import { NextResponse } from "next/server";
import { executeGtrRecordsets } from "@/lib/gtr-sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function calcular(lunes: string, cambios: unknown = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lunes) || new Date(`${lunes}T12:00:00Z`).getUTCDay() !== 1)
    return NextResponse.json({ error: "Selecciona el lunes de la semana." }, { status: 400 });
  if (!Array.isArray(cambios) || cambios.length > 500)
    return NextResponse.json({ error: "La propuesta debe contener como máximo 500 asesores." }, { status: 400 });
  const json = JSON.stringify(cambios);
  if (json.length > 200_000) return NextResponse.json({ error: "La propuesta es demasiado grande." }, { status: 400 });
  try {
    const [resumen = [], horarios = [], cobertura = [], detalle = [], pausas = []] = await executeGtrRecordsets("mart.sp_SimularPlanificacionSemana", {
      FechaLunes: lunes, CambiosJson: json,
    });
    return NextResponse.json({ lunes, resumen, horarios, cobertura, detalle, pausas }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GTR planificación semanal", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo calcular la cobertura." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  return calcular(new URL(request.url).searchParams.get("lunes") ?? "");
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host)
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  try {
    const body = await request.json();
    return calcular(String(body.lunes ?? ""), body.cambios ?? []);
  } catch {
    return NextResponse.json({ error: "La propuesta enviada no es válida." }, { status: 400 });
  }
}
