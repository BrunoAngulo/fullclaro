import * as XLSX from "xlsx";

export type DimensionInterval = {
  serviceDate: string;
  timeSlot: string;
  plannedCalls: number | null;
  plannedTmgSeconds: number | null;
  requiredAdvisors: number | null;
  plannedHours: number | null;
};

export type ParsedDimensionFile = {
  campaignName: string;
  periodMonth: string;
  rows: DimensionInterval[];
  warnings: string[];
};

type DateParts = { year: number; month: number; day: number };

function cleanText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function excelDateParts(value: unknown): DateParts | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
  }
  if (typeof value === "number" && value > 10_000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return { year: parsed.y, month: parsed.m, day: parsed.d };
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    return { year, month, day };
  }
  return null;
}

function formatDate(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function monthKey(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

function timeSlot(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:00`;
  }
  if (typeof value === "number" && value >= 0 && value < 1) {
    const minutes = Math.round(value * 24 * 60);
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;
  }
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (match) return `${match[1].padStart(2, "0")}:${match[2]}:00`;
  }
  return null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value.replace(/,/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function expectedHeaders(row: unknown[], startColumn: number): boolean {
  const labels = row.slice(startColumn, startColumn + 4).map(cleanText);
  return (
    labels[0]?.includes("LLAMADAS") &&
    labels[1]?.includes("TMG") &&
    labels[2]?.includes("ASESORES") &&
    labels[3]?.includes("HORAS")
  );
}

function fullClaroDailyCalls(workbook: XLSX.WorkBook): Map<string, number> {
  const dailySheetName = workbook.SheetNames.find((name) => cleanText(name) === "DETALLE DIA");
  const sheet = dailySheetName ? workbook.Sheets[dailySheetName] : undefined;
  if (!sheet) return new Map();

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const campaignRow = matrix.findIndex((row) => row.some((cell) => cleanText(cell) === "FULL CLARO"));
  if (campaignRow === -1) return new Map();

  const header = matrix[campaignRow + 1] ?? [];
  const dateColumn = header.findIndex((cell) => cleanText(cell) === "DIA");
  const callsColumn = header.findIndex((cell) => cleanText(cell).includes("LLAMADAS"));
  if (dateColumn === -1 || callsColumn === -1) return new Map();

  const result = new Map<string, number>();
  for (let rowIndex = campaignRow + 2; rowIndex < matrix.length; rowIndex += 1) {
    const date = excelDateParts(matrix[rowIndex]?.[dateColumn]);
    if (!date) break;
    const calls = numberOrNull(matrix[rowIndex]?.[callsColumn]);
    if (calls !== null && calls > 0) result.set(formatDate(date), calls);
  }
  return result;
}

function findBlockMatchingDailyCalls(matrix: unknown[][], expectedCalls: Map<string, number>) {
  if (!expectedCalls.size) return null;

  for (let campaignRow = 0; campaignRow < matrix.length - 2; campaignRow += 1) {
    const headerRow = matrix[campaignRow + 1] ?? [];
    const hourColumn = headerRow.findIndex((cell) => cleanText(cell) === "HORA");
    if (hourColumn === -1) continue;

    const campaignDates = matrix[campaignRow] ?? [];
    const groups: Array<{ column: number; date: DateParts }> = [];
    for (let column = hourColumn + 1; column < campaignDates.length; column += 1) {
      const date = excelDateParts(campaignDates[column]);
      if (date && expectedHeaders(headerRow, column)) groups.push({ column, date });
    }
    if (!groups.length) continue;

    const calculatedCalls = new Map<string, number>();
    for (const group of groups) {
      let total = 0;
      for (let rowIndex = campaignRow + 2; rowIndex < matrix.length; rowIndex += 1) {
        const row = matrix[rowIndex] ?? [];
        if (!timeSlot(row[hourColumn])) break;
        total += numberOrNull(row[group.column]) ?? 0;
      }
      calculatedCalls.set(formatDate(group.date), total);
    }

    const matches = [...expectedCalls.entries()].filter(([date, calls]) =>
      Math.abs((calculatedCalls.get(date) ?? 0) - calls) < 0.01,
    );
    if (matches.length === expectedCalls.size) return { campaignRow, campaignColumn: hourColumn };
  }
  return null;
}

export function parseDimensionWorkbook(buffer: Buffer): ParsedDimensionFile {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
  const sheet = workbook.Sheets["Detalle Franjas"];
  if (!sheet) throw new Error('No se encontró la hoja "Detalle Franjas".');

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  let campaignRow = -1;
  let campaignColumn = -1;
  const warnings: string[] = [];

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const columnIndex = matrix[rowIndex].findIndex((cell) => cleanText(cell) === "FULL CLARO");
    if (columnIndex !== -1) {
      campaignRow = rowIndex;
      campaignColumn = columnIndex;
      break;
    }
  }

  if (campaignRow === -1) {
    const fallback = findBlockMatchingDailyCalls(matrix, fullClaroDailyCalls(workbook));
    if (!fallback) {
      throw new Error('No se encontró el bloque "FULL CLARO" dentro de "Detalle Franjas", ni un bloque cuyas franjas coincidan con el resumen diario de Full Claro.');
    }
    campaignRow = fallback.campaignRow;
    campaignColumn = fallback.campaignColumn;
    warnings.push('El bloque de franjas no estaba rotulado como FULL CLARO; se identificó al coincidir con los totales de Detalle día.');
  }

  const headerRow = matrix[campaignRow + 1] ?? [];
  const firstDataRow = campaignRow + 2;
  const dateGroups: Array<{ column: number; date: DateParts }> = [];
  const campaignDates = matrix[campaignRow] ?? [];

  for (let column = campaignColumn + 1; column < campaignDates.length; column += 1) {
    const date = excelDateParts(campaignDates[column]);
    if (date && expectedHeaders(headerRow, column)) dateGroups.push({ column, date });
  }

  if (!dateGroups.length) {
    throw new Error("Se encontró Full Claro, pero no las cuatro columnas esperadas: Llamadas, TMG, Asesores y Horas.");
  }

  const candidates: Array<{ month: string; row: DimensionInterval }> = [];
  for (const group of dateGroups) {
    const groupRows: DimensionInterval[] = [];
    for (let rowIndex = firstDataRow; rowIndex < matrix.length; rowIndex += 1) {
      const sourceRow = matrix[rowIndex] ?? [];
      const slot = timeSlot(sourceRow[campaignColumn]);
      if (!slot) break;

      const plannedCalls = numberOrNull(sourceRow[group.column]);
      const plannedTmgSeconds = numberOrNull(sourceRow[group.column + 1]);
      const requiredAdvisors = numberOrNull(sourceRow[group.column + 2]);
      const plannedHours = numberOrNull(sourceRow[group.column + 3]);

      if ([plannedCalls, plannedTmgSeconds, requiredAdvisors, plannedHours].some((value) => value !== null)) {
        groupRows.push({
          serviceDate: formatDate(group.date),
          timeSlot: slot,
          plannedCalls,
          plannedTmgSeconds,
          requiredAdvisors,
          plannedHours,
        });
      }
    }
    groupRows.forEach((row) => candidates.push({ month: monthKey(group.date), row }));
  }

  if (!candidates.length) throw new Error("El bloque Full Claro no contiene franjas con valores numéricos.");

  const monthCounts = new Map<string, number>();
  candidates.forEach(({ month }) => monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1));
  const [periodMonth] = [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const rows = candidates.filter(({ month }) => month === periodMonth).map(({ row }) => row);
  if (rows.length % 48 !== 0) warnings.push(`Se importarán ${rows.length} franjas; se esperaban múltiplos de 48.`);
  if (monthCounts.size > 1) warnings.push(`Se detectaron varias fechas; se importó el mes predominante ${periodMonth}.`);

  return { campaignName: "FULL CLARO", periodMonth, rows, warnings };
}
