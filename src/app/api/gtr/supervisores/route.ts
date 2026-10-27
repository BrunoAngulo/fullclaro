import { NextResponse } from "next/server";
import { executeGtrRecordsets } from "@/lib/gtr-sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && value >= "0001-01-01"
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
function failure(error: unknown) {
  const number = (error as { number?: number }).number;
  if (number && number >= 51201 && number <= 51211)
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  console.error("GTR supervisión", error);
  return NextResponse.json({ error: "No se pudo completar la consulta de supervisores. Revisa SQL Server local." }, { status: 503 });
}
export async function GET(request: Request) {
  const fecha = new URL(request.url).searchParams.get("fecha");
  if (!validDate(fecha)) return NextResponse.json({ error: "Selecciona una fecha válida." }, { status: 400 });
  try {
    const [supervisores = [], resumen = [], asesores = [], historial = [], objetivos = []] =
      await executeGtrRecordsets("mart.sp_ReporteSupervisoresWeb", { Fecha: fecha });
    return NextResponse.json({ fecha, supervisores, resumen, asesores, historial, objetivos }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 100_000) return NextResponse.json({ error: "La solicitud es demasiado grande." }, { status: 413 });
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch { return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 }); }
  const id = body.supervisorId ?? "";
  if (typeof id !== "string" || id.length > 100)
    return NextResponse.json({ error: "Supervisor inválido." }, { status: 400 });
  try {
    if (body.accion === "supervisor") {
      if (typeof body.nombre !== "string" || !body.nombre.trim() || body.nombre.trim().length > 250 || typeof body.activa !== "boolean")
        return NextResponse.json({ error: "Escribe un nombre de hasta 250 caracteres." }, { status: 400 });
      const [result = []] = await executeGtrRecordsets("cfg.sp_GuardarSupervisorWeb", {
        SupervisorId: id, Nombre: body.nombre.trim(), Activa: body.activa,
      });
      return NextResponse.json({ ok: true, supervisor: result[0] });
    }
    if (body.accion === "asignar") {
      if (!validDate(body.fechaDesde) || !Array.isArray(body.agentes) || body.agentes.length === 0 || body.agentes.length > 500
        || body.agentes.some((v) => typeof v !== "string" || !v || v.length > 128))
        return NextResponse.json({ error: "Selecciona asesores y una fecha válida para aplicar el cambio." }, { status: 400 });
      const [result = []] = await executeGtrRecordsets("cfg.sp_AsignarSupervisoresWeb", {
        SupervisorId: id, FechaDesde: body.fechaDesde, AgentesJson: JSON.stringify(body.agentes),
      });
      return NextResponse.json({ ok: true, resultado: result[0] });
    }
    return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
  } catch (error) { return failure(error); }
}
