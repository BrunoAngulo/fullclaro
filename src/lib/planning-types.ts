export type PlanningRow = Record<string, string | number | boolean | null>;
export type Advisor = {
  Usuario: string; DNI: string | null; TipoDocumento: string | null; Agente: string;
  Estado: string; Modalidad: string | null; Supervisor: string | null; DS: string;
  Campana?: string | null; SubCampana?: string | null; UsuarioW?: string | null;
  FranjaModalidad?: string | null; TipoOrigen?: string | null; BreakRegular?: string | null; Condicion?: string | null;
  Entrada: string; Salida: string; InicioBreak: string | null; FinBreak: string | null;
  Horario: string; Break: string | null; TipoJornada: string | null; Turno: string | null;
  EsFT: boolean; EsMadrugada: boolean; Modificado: boolean;
};
export type AdvisorChange = Pick<Advisor, "Usuario" | "Estado" | "DS" | "Entrada" | "Salida" | "InicioBreak" | "FinBreak">;
export type WeekPlan = { lunes: string; resumen: PlanningRow[]; horarios: Advisor[]; cobertura: PlanningRow[]; detalle: PlanningRow[]; pausas: PlanningRow[] };
export const WEEK_DAYS = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO"];
export const dateKey = (value: unknown) => String(value ?? "").slice(0, 10);
export const normalizeDay = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
export const asChange = (row: Advisor): AdvisorChange => ({ Usuario: row.Usuario, Estado: row.Estado, DS: row.DS,
  Entrada: row.Entrada, Salida: row.Salida, InicioBreak: row.InicioBreak, FinBreak: row.FinBreak });
