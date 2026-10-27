import * as XLSX from "xlsx";
import {
  sumKeys,
  type Totals,
  type Metrics,
  type ReportRow,
  type ReportDataset,
} from "./report-types";
const clean = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
const num = (v: unknown): number | null =>
  v !== null &&
  v !== undefined &&
  String(v).trim() !== "" &&
  Number.isFinite(Number(v))
    ? Number(v)
    : null;
const text = (v: unknown) => String(v ?? "").trim() || "Sin asignar";
export const emptyTotals = () =>
  Object.fromEntries(sumKeys.map((k) => [k, 0])) as Totals;
export function aggregate(rows: Totals[]): Metrics {
  const a = emptyTotals();
  for (const row of rows) for (const k of sumKeys) a[k] += row[k];
  const ratio = (n: number, d: number) => (d ? (n / d) * 100 : null);
  return {
    ...a,
    tmo: a.tmoCount ? a.tmoSeconds / a.tmoCount : null,
    tnps: ratio(a.tnpsSum, a.tnpsCount),
    nps: ratio(a.npsSum, a.npsCount),
    nda: ratio(a.answered, a.received),
    nds: ratio(a.within20, a.received),
    ns15: a.waitKnown === a.answered ? ratio(a.within15, a.received) : null,
    avh2: ratio(a.within20, a.answered),
    cat: ratio(a.catCount, a.answered),
    transfer: ratio(
      a.surveyIn,
      a.surveyIn + a.clientIn + a.agentIn + a.systemIn,
    ),
    transferContract: ratio(a.surveyIn, a.answered),
    promoterRate: ratio(a.promoters, a.tnpsCount),
    neutralRate: ratio(a.neutrals, a.tnpsCount),
    detractorRate: ratio(a.detractors, a.tnpsCount),
    abandonRate: ratio(a.abandoned, a.received),
  };
}
export function groupRows(rows: ReportRow[], key: keyof ReportRow) {
  const groups = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const label = String(r[key]);
    const bucket = groups.get(label) ?? [];
    bucket.push(r);
    groups.set(label, bucket);
  }
  return [...groups]
    .map(([label, items]) => ({ label, ...aggregate(items) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
function dateKey(v: unknown): string | null {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d
      ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`
      : null;
  }
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(iso + "T00:00:00Z");
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === iso ? iso : null;
}
export function parseReport(buffer: Buffer, filename: string): ReportDataset {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const name = wb.SheetNames.find((n) =>
    clean(n).startsWith("REPORT DE TRAZABILIDAD"),
  );
  if (!name)
    throw new Error(
      "Este archivo no contiene la hoja Report De Trazabilidad. Para Detalle Franjas, usa Dimensionamiento.",
    );
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
    header: 1,
    defval: null,
    raw: true,
  });
  const header = matrix[0].map(clean);
  const column = (name: string) => header.indexOf(clean(name));
  const required = [
    "FECHA",
    "ESTADO",
    "Atendidas",
    "Abandonadas",
    "Recibidas",
    "Atendia en 20",
    "tmo_atendido",
    "tnps",
    "tnps_q",
    "nps",
    "nps_q",
    "Cat",
    "Tx Encuesta Entrante",
    "CLIENTE Entrante",
    "ASESOR Entrante",
    "SISTEMA Entrante",
    "Promotor",
    "Neutro",
    "Detractor",
  ];
  const missing = required.filter((n) => column(n) < 0);
  if (missing.length)
    throw new Error(`Faltan columnas: ${missing.join(", ")}.`);
  const ix = Object.fromEntries(header.map((v, i) => [v, i]));
  const rows: ReportRow[] = [];
  let invalid = 0,
    errors = 0;
  for (const raw of matrix.slice(1)) {
    if (!raw.some((v) => v !== null)) continue;
    const get = (n: string) => raw[ix[clean(n)]];
    const n = (s: string) => num(get(s)) ?? 0;
    const date = dateKey(get("FECHA"));
    if (!date) {
      invalid++;
      continue;
    }
    // Cached formula results are the source of the Excel's pivot reports. Never evaluate workbook code.
    if (
      required
        .slice(2)
        .some(
          (k) =>
            num(get(k)) === null && !(k === "tmo_atendido" && !n("Atendidas")),
        )
    ) {
      errors++;
      continue;
    }
    const answered = n("Atendidas");
    const wait = num(get("ATENDIDA X SEG"));
    const tmo = num(get("tmo_atendido"));
    const slotValue = get("FRANJA");
    const slot =
      typeof slotValue === "number"
        ? `${String(Math.floor(slotValue * 24)).padStart(2, "0")}:${String(Math.round(slotValue * 1440) % 60).padStart(2, "0")}`
        : text(slotValue).slice(0, 5);
    rows.push({
      ...emptyTotals(),
      date,
      slot,
      agent: text(get("AGENTE") ?? get("NOMBRE AGENTE")),
      supervisor: text(get("SUPERVISOR")),
      skill: text(get("NOMBRE DE SKILL/COLA")),
      direction: text(get("DIRECCION INICIAL")),
      site: text(get("SEDE")),
      mode: text(get("TIPO DE GESTIÓN")),
      condition: text(get("CONDICION")),
      records: 1,
      received: n("Recibidas"),
      answered,
      abandoned: n("Abandonadas"),
      within20: n("Atendia en 20"),
      within15: answered && wait !== null && wait <= 15 ? 1 : 0,
      waitKnown: answered && wait !== null ? 1 : 0,
      tmoSeconds: tmo ?? 0,
      tmoCount: answered && tmo !== null ? 1 : 0,
      tnpsSum: n("tnps"),
      tnpsCount: n("tnps_q"),
      npsSum: n("nps"),
      npsCount: n("nps_q"),
      promoters: n("Promotor"),
      neutrals: n("Neutro"),
      detractors: n("Detractor"),
      catCount: n("Cat"),
      surveyIn: n("Tx Encuesta Entrante"),
      clientIn: n("CLIENTE Entrante"),
      agentIn: n("ASESOR Entrante"),
      systemIn: n("SISTEMA Entrante"),
      surveyAll: n("Tx Encuesta"),
      sales: n("Tx Ventas"),
      clientCuts: n("CLIENTE"),
      agentCuts: n("ASESOR"),
      systemCuts: n("SISTEMA"),
      outTransfers: n("SALIENTE TRANS"),
      talk: n("TIEMPO CONVERSACION"),
      hold: n("TIEMPO HOLD"),
      acw: n("TIEMPO ACW"),
    });
  }
  if (errors)
    throw new Error(
      `${errors} filas tienen indicadores vacíos o errores de fórmula. Recalcula y guarda el Excel antes de importarlo.`,
    );
  if (invalid)
    throw new Error(
      `${invalid} filas tienen fechas inválidas. Corrige el Excel antes de importarlo.`,
    );
  if (!rows.length) throw new Error("No se encontraron registros válidos.");
  const sheets = wb.SheetNames.filter((n) => n !== name).map((name) => ({
    name,
    rows: XLSX.utils
      .sheet_to_json<
        (string | number | null)[]
      >(wb.Sheets[name], { header: 1, defval: null, raw: true })
      .filter((r) => r.some((v) => v !== null)),
  }));
  const total = sheets
    .find((s) => s.name === "Diario")
    ?.rows.find((r) => clean(r[0]) === "TOTAL");
  const control: Record<string, number> = {};
  if (total) {
    [
      "received",
      "answered",
      "within20",
      "abandoned",
      "tmo",
      "tnps",
      "nps",
      "transfer",
      "cat",
      "nda",
      "nds",
      "promoterRate",
      "neutralRate",
      "detractorRate",
    ].forEach((key, i) => {
      if (typeof total[i + 1] === "number")
        control[key] = (total[i + 1] as number) * (i >= 5 ? 100 : 1);
    });
  }
  return {
    filename,
    rows,
    sheets,
    warnings: [
      "Los resúmenes guardados en Excel pueden tener filtros y fechas distintos. Los filtros del dashboard recalculan desde Trazabilidad.",
      "NS 15 s se deriva de ATENDIDA X SEG, el mismo campo que usa el Excel para Atendia en 20; validar su definición con Claro antes de usarlo para liquidación.",
    ],
    control,
  };
}
