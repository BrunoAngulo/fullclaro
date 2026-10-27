export const sumKeys = [
  "records",
  "received",
  "answered",
  "abandoned",
  "within20",
  "within15",
  "waitKnown",
  "tmoSeconds",
  "tmoCount",
  "tnpsSum",
  "tnpsCount",
  "npsSum",
  "npsCount",
  "promoters",
  "neutrals",
  "detractors",
  "catCount",
  "surveyIn",
  "clientIn",
  "agentIn",
  "systemIn",
  "surveyAll",
  "sales",
  "clientCuts",
  "agentCuts",
  "systemCuts",
  "outTransfers",
  "talk",
  "hold",
  "acw",
] as const;
export type SumKey = (typeof sumKeys)[number];
export type Totals = Record<SumKey, number>;
export type Metrics = Totals & {
  tmo: number | null;
  tnps: number | null;
  nps: number | null;
  nda: number | null;
  nds: number | null;
  ns15: number | null;
  avh2: number | null;
  cat: number | null;
  transfer: number | null;
  promoterRate: number | null;
  neutralRate: number | null;
  detractorRate: number | null;
  abandonRate: number | null;
  transferContract: number | null;
};
export type ReportRow = Totals & {
  date: string;
  slot: string;
  agent: string;
  supervisor: string;
  skill: string;
  direction: string;
  site: string;
  mode: string;
  condition: string;
};
export type SheetSnapshot = {
  name: string;
  rows: (string | number | null)[][];
};
export type ReportDataset = {
  filename: string;
  rows: ReportRow[];
  sheets: SheetSnapshot[];
  warnings: string[];
  control: Record<string, number>;
};
export type MetricKey = keyof Metrics;
export type Group = Metrics & { label: string };
export type ReportResponse = {
  id: number;
  filename: string;
  importedAt: string;
  totalRecords: number;
  dates: string[];
  filters: Record<string, string[]>;
  kpis: Metrics;
  daily: Group[];
  agents: Group[];
  supervisors: Group[];
  slots: Group[];
  skills: Group[];
  directions: Group[];
  sheets: SheetSnapshot[];
  warnings: string[];
  reconciliation: {
    metric: string;
    source: number;
    calculated: number;
    matches: boolean;
  }[];
};
