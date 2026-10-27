export type Supervisor = { SupervisorId: string; Nombre: string; Activa: boolean };
export type TeamKpi = {
  Nivel: "ASESOR" | "SUPERVISOR" | "TOTAL"; AgenteId: string | null; Agente: string | null;
  DNI: string | null; Modalidad: string | null; Estado: string | null;
  SupervisorId: string; Supervisor: string; FuenteAsignacion: string | null; VigenteDesde: string | null;
  Asesores: number; Activos: number; ConActividad: number; EnDotacion?: number; Registros: number;
  Recibidas: number; Atendidas: number; Abandonadas: number; Salientes: number; Atendidas15: number;
  CATCantidad: number; GestionSeg: number; GestionSinDuracion: number; TransferidasEncuesta: number;
  Encuestas: number; Promotores: number; Neutros: number; Detractores: number;
  NA: number | null; NS: number | null; CAT: number | null; Abandono: number | null;
  TMG: number | null; Transferencia: number | null; Participacion: number | null; TNPS: number | null;
  CumpleNS: boolean | null; CumpleNA: boolean | null; CumpleCAT: boolean | null;
  CumpleTMG: boolean | null; CumpleTNPS: boolean | null; CumpleTransferencia: boolean | null;
};
export type SupervisionData = {
  fecha: string; supervisores: Supervisor[]; resumen: TeamKpi[]; asesores: TeamKpi[];
  historial: { AgenteId: string; Agente: string; Supervisor: string; VigenteDesde: string; VigenteHasta: string | null }[];
  objetivos: { Codigo: string; Objetivo: number; Operador: string }[];
};
