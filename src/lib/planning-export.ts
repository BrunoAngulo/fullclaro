import * as XLSX from "xlsx";
import { dateKey, WEEK_DAYS, type WeekPlan } from "./planning-types";

export function buildPlanningWorkbook(plan: WeekPlan) {
  const libro = XLSX.utils.book_new();
  const dates = plan.resumen.map((row) => dateKey(row.Fecha));
  const times = [...new Set(plan.cobertura.map((row) => String(row.Tramo)))].sort();
  const matriz = times.map((hora) => Object.fromEntries([["Hora", hora], ...dates.map((date, day) => [WEEK_DAYS[day],
    plan.cobertura.find((row) => dateKey(row.Fecha) === date && row.Tramo === hora)?.Variacion ?? null])]));
  const agentes = plan.horarios.map((a) => ({
    ESTADO: a.Estado, "TIPO DOCUMENTO": a.TipoDocumento, "NO DOC": a.DNI, "NOMBRES Y APELLIDOS": a.Agente,
    "USUARIO E": a.Usuario, CAMPANA: a.Campana, "SUB CAMPANA": a.SubCampana, "USUARIO W": a.UsuarioW,
    "TIPO DE JORNADA": a.TipoJornada, MODALIDAD: a.FranjaModalidad ?? a.Modalidad, TIPO: a.TipoOrigen ?? a.Modalidad,
    SUPERVISOR: a.Supervisor, CONDICION: a.Condicion, DS: a.DS, HORARIO: a.Horario, "BREAK REGULAR": a.Break,
  }));
  const dotacion = plan.horarios.map((a) => ({ Estado: a.Estado, "Tipo documento": a.TipoDocumento, DNI: a.DNI,
    Agente: a.Agente, Usuario: a.Usuario, Modalidad: a.Modalidad, Supervisor: a.Supervisor, DS: a.DS,
    "Horario propuesto": a.Horario, Jornada: a.TipoJornada, "Break regular": a.Break, Cambio: a.Modificado ? "Sí" : "No",
    ...Object.fromEntries(WEEK_DAYS.map((dia, day) => [dia, plan.detalle.find((r) => r.Usuario === a.Usuario && dateKey(r.Fecha) === dates[day])?.Horario ?? a.Estado])) }));
  const sheets: [string, Record<string, unknown>[]][] = [["AGENTES", agentes], ["Variación semanal", matriz], ["Dotación y horarios", dotacion],
    ["Resumen diario", plan.resumen.map((r) => ({ ...r, Fecha: dateKey(r.Fecha) }))],
    ["Cobertura por tramo", plan.cobertura.map((r) => ({ ...r, Fecha: dateKey(r.Fecha) }))],
    ["Detalle diario", plan.detalle.map((r) => ({ ...r, Fecha: dateKey(r.Fecha) }))]];
  for (const [nombre, rows] of sheets) {
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!autofilter"] = { ref: sheet["!ref"] ?? "A1" };
    sheet["!cols"] = Object.keys(rows[0] ?? {}).map((key) => ({ wch: Math.min(46, Math.max(key.length + 2, ...rows.map((r) => String(r[key] ?? "").length + 2), 11)) }));
    XLSX.utils.book_append_sheet(libro, sheet, nombre);
  }
  return libro;
}

export function downloadPlanning(plan: WeekPlan) {
  XLSX.writeFile(buildPlanningWorkbook(plan), `Dota - Full Claro actualizada ${plan.lunes}.xlsx`, { compression: true });
}
