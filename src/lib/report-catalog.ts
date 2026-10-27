import type { MetricKey } from "./report-types";
export type Indicator = {
  key: MetricKey;
  label: string;
  unit: "count" | "percent" | "seconds";
  formula: string;
};
export const indicators: Indicator[] = [
  {
    key: "received",
    label: "Llamadas recibidas",
    unit: "count",
    formula: "Atendidas + abandonadas.",
  },
  {
    key: "answered",
    label: "Llamadas atendidas",
    unit: "count",
    formula: "Suma de Atendidas.",
  },
  {
    key: "abandoned",
    label: "Llamadas abandonadas",
    unit: "count",
    formula: "Suma de Abandonadas.",
  },
  {
    key: "within20",
    label: "Atendidas en 20 s",
    unit: "count",
    formula: "Suma de Atendia en 20.",
  },
  {
    key: "tmo",
    label: "TMO",
    unit: "seconds",
    formula:
      "Suma de tmo_atendido / atendidas con TMO numérico. El Excel usa DURACION.",
  },
  {
    key: "tnps",
    label: "TNPS",
    unit: "percent",
    formula:
      "Suma de tnps / tnps_q. Incluye respuestas entrantes y salientes, igual que el Excel.",
  },
  {
    key: "nps",
    label: "NPS",
    unit: "percent",
    formula: "Suma de nps / nps_q (segunda pregunta).",
  },
  {
    key: "transfer",
    label: "Transferencia a encuesta",
    unit: "percent",
    formula:
      "Tx Encuesta Entrante / (Tx Encuesta Entrante + CLIENTE Entrante + ASESOR Entrante + SISTEMA Entrante).",
  },
  {
    key: "cat",
    label: "CAT",
    unit: "percent",
    formula:
      "Cat / Atendidas. Cat identifica atendidas con CORTADA POR = No cliente.",
  },
  {
    key: "nda",
    label: "Nivel de atención",
    unit: "percent",
    formula: "Atendidas / Recibidas.",
  },
  {
    key: "nds",
    label: "NDS · 20 segundos",
    unit: "percent",
    formula: "Atendia en 20 / Recibidas. Distinto al NS de 15 s del PDF.",
  },
  {
    key: "promoterRate",
    label: "Promotores",
    unit: "percent",
    formula: "Promotor / tnps_q (calificación 9–10).",
  },
  {
    key: "neutralRate",
    label: "Neutros",
    unit: "percent",
    formula: "Neutro / tnps_q (calificación 7–8).",
  },
  {
    key: "detractorRate",
    label: "Detractores",
    unit: "percent",
    formula: "Detractor / tnps_q (calificación 0–6).",
  },
  {
    key: "avh2",
    label: "AVH2",
    unit: "percent",
    formula: "Atendia en 20 / Atendidas. Meta ≥ 85%.",
  },
  {
    key: "ns15",
    label: "NS · 15 s (estimado)",
    unit: "percent",
    formula:
      "Atendidas con ATENDIDA X SEG ≤ 15 / Recibidas. Validar el campo de tiempo con Claro.",
  },
  {
    key: "abandonRate",
    label: "Tasa de abandono",
    unit: "percent",
    formula: "Abandonadas / Recibidas.",
  },
  {
    key: "tnpsCount",
    label: "Respuestas TNPS",
    unit: "count",
    formula: "Suma de tnps_q.",
  },
  {
    key: "npsCount",
    label: "Respuestas NPS",
    unit: "count",
    formula: "Suma de nps_q.",
  },
  {
    key: "promoters",
    label: "Promotores · cantidad",
    unit: "count",
    formula: "Suma de Promotor.",
  },
  {
    key: "neutrals",
    label: "Neutros · cantidad",
    unit: "count",
    formula: "Suma de Neutro.",
  },
  {
    key: "detractors",
    label: "Detractores · cantidad",
    unit: "count",
    formula: "Suma de Detractor.",
  },
  {
    key: "surveyAll",
    label: "Transferencias a encuesta · total",
    unit: "count",
    formula: "Suma de Tx Encuesta, todas las direcciones.",
  },
  {
    key: "surveyIn",
    label: "Transferencias a encuesta · entrantes",
    unit: "count",
    formula: "Suma de Tx Encuesta Entrante.",
  },
  {
    key: "sales",
    label: "Transferencias a ventas",
    unit: "count",
    formula: "Suma de Tx Ventas; no representa ventas completadas.",
  },
  {
    key: "clientCuts",
    label: "Cortes por cliente",
    unit: "count",
    formula: "Suma de CLIENTE, sin transferencia.",
  },
  {
    key: "agentCuts",
    label: "Cortes por asesor",
    unit: "count",
    formula: "Suma de ASESOR, sin transferencia; no equivale a Cat.",
  },
  {
    key: "systemCuts",
    label: "Cortes por sistema",
    unit: "count",
    formula: "Suma de SISTEMA, sin transferencia.",
  },
  {
    key: "outTransfers",
    label: "Salientes > 30 s de conversación",
    unit: "count",
    formula: "Suma de SALIENTE TRANS.",
  },
  {
    key: "talk",
    label: "Tiempo de conversación",
    unit: "seconds",
    formula: "Suma de TIEMPO CONVERSACION.",
  },
  {
    key: "hold",
    label: "Tiempo en hold",
    unit: "seconds",
    formula: "Suma de TIEMPO HOLD.",
  },
  {
    key: "acw",
    label: "Tiempo ACW",
    unit: "seconds",
    formula: "Suma de TIEMPO ACW.",
  },
];
export const fmt = (
  v: number | null | undefined,
  unit: Indicator["unit"] = "count",
) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("es-PE", {
        maximumFractionDigits: unit === "count" ? 0 : 1,
      }).format(v) +
      (unit === "percent" ? "%" : unit === "seconds" ? " s" : "");
