"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  ChartNoAxesCombined,
  Users,
  Clock3,
  FileSpreadsheet,
  ShieldCheck,
  Upload,
  Download,
  ChevronRight,
  ArrowUpRight,
  Phone,
  Headphones,
  MessageSquare,
  Activity,
  Search,
  PanelLeftClose,
  CalendarDays,
  Check,
  Info,
  LoaderCircle,
} from "lucide-react";
import { Line, LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { XAxis } from "@/components/charts/x-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { indicators, fmt, type Indicator } from "@/lib/report-catalog";
import type { ReportResponse, MetricKey, Group } from "@/lib/report-types";
type View =
  | "overview"
  | "metrics"
  | "agents"
  | "intervals"
  | "contract"
  | "source";
const nav = [
  { id: "overview", label: "Vista general", icon: LayoutDashboard },
  { id: "metrics", label: "Indicadores", icon: ChartNoAxesCombined },
  { id: "agents", label: "Equipo y agentes", icon: Users },
  { id: "intervals", label: "Franjas horarias", icon: Clock3 },
  { id: "contract", label: "Objetivos comerciales", icon: ShieldCheck },
  { id: "source", label: "Fuentes de datos", icon: FileSpreadsheet },
] as const;
const titles: Record<View, string> = {
  overview: "Una mirada a tu operación.",
  metrics: "Cada indicador, en detalle.",
  agents: "El pulso de tu equipo.",
  intervals: "La operación, por franja.",
  contract: "Resultados frente a objetivos.",
  source: "Del Excel a tus decisiones.",
};
const shortDate = (v: string) =>
  new Date(v + "T12:00:00").toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
  });
const meta = (k: MetricKey) => indicators.find((i) => i.key === k)!;
function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="r-panel">
      <div className="r-panel-head">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Trend({ rows, metric }: { rows: Group[]; metric: MetricKey }) {
  const points = useMemo(
    () =>
      rows
        .filter((r) => r[metric] !== null)
        .map((r) => ({
          date: new Date(r.label + "T12:00:00"),
          [meta(metric).label]: r[metric],
        })),
    [rows, metric],
  );
  return points.length ? (
    <LineChart data={points} aspectRatio="3 / 1" style={{ height: 260 }}>
      <Grid horizontal stroke="#edf0f3" />
      <Line dataKey={meta(metric).label} stroke="#e3343a" strokeWidth={2.5} />
      <XAxis numTicks={6} />
      <ChartTooltip />
    </LineChart>
  ) : (
    <p className="r-empty">No hay datos para este indicador.</p>
  );
}
function Bars({
  rows,
  metric = "answered",
}: {
  rows: Group[];
  metric?: MetricKey;
}) {
  return rows.length ? (
    <BarChart
      data={rows.map((r) => ({ ...r, [meta(metric).label]: r[metric] }))}
      xDataKey="label"
      aspectRatio="2 / 1"
    >
      <Grid horizontal stroke="#edf0f3" />
      <Bar dataKey={meta(metric).label} fill="#e84348" lineCap="round" />
      <BarXAxis />
      <ChartTooltip />
    </BarChart>
  ) : (
    <p className="r-empty">Sin registros para estos filtros.</p>
  );
}
export default function Reporting() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [imports, setImports] = useState<{ id: number; filename: string }[]>(
    [],
  );
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [metric, setMetric] = useState<MetricKey>("answered");
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState("Diario");
  const [agentSort, setAgentSort] = useState<MetricKey>("answered");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/report?" + new URLSearchParams(filters), {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        const r = await res.json();
        if (!res.ok) throw new Error(r.error);
        setData(r.empty ? null : r);
        setImports(r.imports ?? []);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, revision]);
  const filter = (key: string, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));
  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const f = new FormData();
      f.append("file", file);
      const res = await fetch("/api/report", { method: "POST", body: f });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      setNotice(r.message);
      setFilters({ id: String(r.id) });
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }
  function exportCsv() {
    if (!data) return;
    const quote = (v: unknown) =>
      '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const lines = [
      ["Fecha", ...indicators.map((i) => i.label)],
      ...data.daily.map((r) => [r.label, ...indicators.map((i) => r[i.key])]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + lines.map((r) => r.map(quote).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "full-claro-indicadores.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  const k = data?.kpis;
  const activeFilters = Object.entries(filters).filter(
    ([key, v]) => key !== "id" && v,
  ).length;
  const agents = useMemo(
    () =>
      data?.agents
        .filter((a) => a.label.toLowerCase().includes(search.toLowerCase()))
        .sort(
          (a, b) => (b[agentSort] ?? -Infinity) - (a[agentSort] ?? -Infinity),
        ) ?? [],
    [data, search, agentSort],
  );
  const months = [
    ...new Set(data?.daily.map((r) => r.label.slice(0, 7)) ?? []),
  ];
  const month = months.length === 1 ? months[0] : null;
  const tnpsGoal =
    month && month >= "2026-08" && month <= "2026-12"
      ? month < "2026-10"
        ? 91
        : 92
      : null;
  const goalRows = [
    {
      name: "Nivel de atención",
      value: k?.nda,
      target: 95,
      label: "≥ 95%",
      unit: "percent",
      less: false,
      note: "Atendidas / recibidas. PDF, p. 3.",
    },
    {
      name: "CAT",
      value: k?.cat,
      target: 5,
      label: "≤ 5%",
      unit: "percent",
      less: true,
      note: "Cortes del asesor / atendidas. PDF, p. 3.",
    },
    {
      name: "AVH2",
      value: k?.avh2,
      target: 85,
      label: "≥ 85%",
      unit: "percent",
      less: false,
      note: "Atendidas en 20 s / atendidas. PDF, p. 3.",
    },
    {
      name: "TNPS",
      value: k?.tnps,
      target: tnpsGoal,
      label: tnpsGoal ? `≥ ${tnpsGoal}%` : "Por mes",
      unit: "percent",
      less: false,
      note: "Tabla mensual, p. 3. Su validez está condicionada a transferencias ≥ 82%.",
    },
    {
      name: "Transferencia a encuesta (Excel)",
      value: k?.transfer,
      target: 82,
      label: "≥ 82%",
      unit: "percent",
      less: false,
      note: "Referencial: el PDF no explicita el denominador; se conserva la fórmula del Excel.",
    },
    {
      name: "NS 15 s · estimado",
      value: k?.ns15,
      target: 90,
      label: "≥ 90%",
      unit: "percent",
      less: false,
      note: "ATENDIDA X SEG ≤ 15 / recibidas. Pendiente validar el campo de tiempo.",
    },
    {
      name: "TMO observado / TMG objetivo",
      value: k?.tmo,
      target: 720,
      label: "720 s",
      unit: "seconds",
      less: true,
      note: "El PDF establece TMG = 720 s. Validar equivalencia con DURACION del Excel.",
    },
  ];
  const metricSelector = (
    <select
      aria-label="Indicador del gráfico"
      value={metric}
      onChange={(e) => setMetric(e.target.value as MetricKey)}
    >
      {indicators.map((i) => (
        <option key={i.key} value={i.key}>
          {i.label}
        </option>
      ))}
    </select>
  );
  return (
    <div className="report-app">
      <aside className="r-sidebar">
        <Link href="/" className="r-brand">
          <span className="r-brand-symbol">
            claro<span>✳</span>
          </span>
          <span>
            Full Claro<small>Centro de operaciones</small>
          </span>
        </Link>
        <div className="r-workspace">
          <span className="r-workspace-icon">FC</span>
          <div>
            Full Claro Black<small>Reportería operativa</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <span className="r-nav-label">ANALÍTICA</span>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              onClick={() => setView(n.id)}
            >
              <n.icon size={18} />
              {n.label}
              {view === n.id && <span className="r-active-dot" />}
            </button>
          ))}
        </nav>
        <span className="r-nav-label">PLANIFICACIÓN</span>
        <Link className="r-dimension-link" href="/dimensionamiento">
          <CalendarDays size={18} />
          Dimensionamiento
          <ArrowUpRight size={14} />
        </Link>
        <div className="r-sidebar-bottom">
          <div className="r-local">
            <i /> Entorno local<small>Datos guardados en MySQL</small>
          </div>
          <div className="r-profile">
            <span>A</span>
            <div>
              Operaciones A365<small>Campaña Full Claro</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="r-content">
        <header className="r-topbar">
          <div>
            <PanelLeftClose size={17} />
            <span>Operaciones</span>
            <ChevronRight size={13} />
            <strong>{nav.find((n) => n.id === view)?.label}</strong>
          </div>
          <span className="r-top-status">
            <i /> Full Claro Black
          </span>
        </header>
        <main className="r-main">
          <div className="r-heading">
            <div>
              <div className="r-eyebrow">FULL CLARO / REPORTERÍA</div>
              <h1>{titles[view]}</h1>
              <p>
                Atención, experiencia y desempeño. Toda la información en un
                solo lugar.
              </p>
            </div>
            <div className="r-actions">
              <button
                className="r-button r-outline"
                onClick={exportCsv}
                disabled={!data || loading}
              >
                <Download size={16} />
                Exportar
              </button>
              <button
                className="r-button r-primary"
                onClick={() => input.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <LoaderCircle size={16} className="r-spin" />
                ) : (
                  <Upload size={16} />
                )}{" "}
                {uploading ? "Importando…" : "Cargar Excel"}
              </button>
              <input
                ref={input}
                type="file"
                accept=".xlsx"
                className="r-hidden"
                aria-label="Cargar Excel de reportería"
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </div>
          </div>
          {error && (
            <div className="r-error" role="alert">
              {error}
              <button onClick={() => setRevision((v) => v + 1)}>
                Reintentar
              </button>
            </div>
          )}
          {notice && (
            <div className="r-notice" role="status">
              <Check size={16} />
              {notice}
            </div>
          )}
          {data && (
            <>
              <section className="r-filters" aria-label="Filtros de reportería">
                <label>
                  <span>Desde</span>
                  <input
                    aria-label="Desde"
                    type="date"
                    value={filters.from ?? data.dates[0]}
                    min={data.dates[0]}
                    max={data.dates.at(-1)}
                    onChange={(e) => filter("from", e.target.value)}
                  />
                </label>
                <label>
                  <span>Hasta</span>
                  <input
                    aria-label="Hasta"
                    type="date"
                    value={filters.to ?? data.dates.at(-1)}
                    min={data.dates[0]}
                    max={data.dates.at(-1)}
                    onChange={(e) => filter("to", e.target.value)}
                  />
                </label>
                {[
                  ["supervisor", "Supervisor"],
                  ["agent", "Agente"],
                  ["skill", "Cola"],
                  ["direction", "Dirección"],
                ].map(([key, label]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <select
                      aria-label={label}
                      value={filters[key] ?? ""}
                      onChange={(e) => filter(key, e.target.value)}
                    >
                      <option value="">Todos</option>
                      {data.filters[key].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                ))}
                <button
                  className="r-reset"
                  onClick={() =>
                    setFilters(filters.id ? { id: filters.id } : {})
                  }
                >
                  Restablecer{activeFilters ? ` (${activeFilters})` : ""}
                </button>
              </section>
              <div className="r-data-line">
                <span>
                  <span className="r-green-dot" />{" "}
                  {loading
                    ? "Actualizando…"
                    : `${fmt(k?.records)} interacciones · ${data.daily.length} días con datos`}
                </span>
                <span>
                  <FileSpreadsheet size={13} />
                  {data.filename}
                </span>
              </div>
            </>
          )}
          {loading && !data ? (
            <div className="r-empty">
              <LoaderCircle className="r-spin" />
              Cargando reportería…
            </div>
          ) : !data ? (
            <section className="r-welcome">
              <FileSpreadsheet size={40} />
              <h2>Tu operación empieza con un Excel.</h2>
              <p>
                Importa Reportería con Colorcitos para ver indicadores,
                tendencias y resultados por agente. Acepta archivos .xlsx de
                hasta 35 MB.
              </p>
              <button
                className="r-button r-primary"
                onClick={() => input.current?.click()}
                disabled={uploading}
              >
                Seleccionar archivo
              </button>
              <Link href="/dimensionamiento">
                Ir al dimensionamiento existente <ArrowUpRight size={14} />
              </Link>
            </section>
          ) : (
            <div
              className={loading ? "r-results r-loading" : "r-results"}
              aria-busy={loading}
            >
              {view === "overview" && (
                <>
                  <section className="r-kpis">
                    {(
                      [
                        {
                          key: "received",
                          icon: Phone,
                          tag: "Demanda entrante",
                        },
                        { key: "nda", icon: Headphones, tag: "Objetivo ≥ 95%" },
                        {
                          key: "tnps",
                          icon: MessageSquare,
                          tag: tnpsGoal
                            ? `Objetivo mensual ≥ ${tnpsGoal}%`
                            : "Satisfacción del cliente",
                        },
                        {
                          key: "tmo",
                          icon: Activity,
                          tag: "Duración media de atención",
                        },
                      ] as const
                    ).map(({ key, icon: Icon, tag }) => (
                      <article key={key}>
                        <div className="r-kpi-top">
                          <span>{meta(key).label}</span>
                          <Icon size={17} />
                        </div>
                        <strong>{fmt(k?.[key], meta(key).unit)}</strong>
                        <div className="r-kpi-foot">
                          <span
                            className={
                              key === "nda" && k?.nda !== null && k!.nda! >= 95
                                ? "r-good"
                                : "r-neutral"
                            }
                          >
                            {tag}
                          </span>
                        </div>
                      </article>
                    ))}
                  </section>
                  <div className="r-grid-main">
                    <Panel
                      title="Así evoluciona la atención"
                      description="Volumen diario de llamadas entrantes"
                      action={<span className="r-pill">Por día</span>}
                    >
                      <div className="r-legend">
                        <span>
                          <i style={{ background: "#e3343a" }} />
                          Recibidas
                        </span>
                        <span>
                          <i style={{ background: "#363c50" }} />
                          Atendidas
                        </span>
                      </div>
                      <LineChart
                        data={data.daily.map((r) => ({
                          date: new Date(r.label + "T12:00:00"),
                          Recibidas: r.received,
                          Atendidas: r.answered,
                        }))}
                        style={{ height: 275 }}
                        aspectRatio="3 / 1"
                      >
                        <Grid horizontal stroke="#edf0f3" />
                        <Line
                          dataKey="Recibidas"
                          stroke="#e3343a"
                          strokeWidth={2.5}
                        />
                        <Line
                          dataKey="Atendidas"
                          stroke="#363c50"
                          strokeWidth={2}
                        />
                        <XAxis numTicks={6} />
                        <ChartTooltip />
                      </LineChart>
                    </Panel>
                    <Panel
                      title="Experiencia del cliente"
                      description={`${fmt(k?.tnpsCount)} respuestas a la primera pregunta`}
                    >
                      <div className="r-score">
                        <strong>{fmt(k?.tnps, "percent")}</strong>
                        <span>TNPS del período</span>
                      </div>
                      <div className="r-sentiment-bar">
                        {[
                          ["promoterRate", "#1f9e79"],
                          ["neutralRate", "#edbb56"],
                          ["detractorRate", "#eb646a"],
                        ].map(([key, color]) => (
                          <span
                            key={key}
                            style={{
                              width: `${k?.[key as MetricKey] ?? 0}%`,
                              background: color,
                            }}
                          />
                        ))}
                      </div>
                      <div className="r-sentiment-list">
                        {[
                          [
                            "promoters",
                            "promoterRate",
                            "Promotores",
                            "#1f9e79",
                          ],
                          ["neutrals", "neutralRate", "Neutros", "#edbb56"],
                          [
                            "detractors",
                            "detractorRate",
                            "Detractores",
                            "#eb646a",
                          ],
                        ].map(([count, rate, label, color]) => (
                          <div key={label}>
                            <span>
                              <i style={{ background: color }} />
                              {label}
                            </span>
                            <small>{fmt(k?.[count as MetricKey])}</small>
                            <strong>
                              {fmt(k?.[rate as MetricKey], "percent")}
                            </strong>
                          </div>
                        ))}
                      </div>
                      <p className="r-footnote">
                        TNPS = (promotores − detractores) / respuestas.
                      </p>
                    </Panel>
                  </div>
                  <div className="r-grid-two">
                    <Panel
                      title="Calidad de la atención"
                      description="Resultados calculados sobre el período filtrado"
                    >
                      <div className="r-quality-grid">
                        {["nds", "avh2", "transfer", "cat"].map((key) => (
                          <div key={key}>
                            <span>{meta(key as MetricKey).label}</span>
                            <strong>
                              {fmt(k?.[key as MetricKey], "percent")}
                            </strong>
                            <small>
                              {key === "nds"
                                ? "Sobre recibidas · 20 s"
                                : key === "avh2"
                                  ? "Sobre atendidas · 20 s"
                                  : key === "cat"
                                    ? "Cortes / atendidas"
                                    : "Fórmula del Excel"}
                            </small>
                          </div>
                        ))}
                      </div>
                      <div className="r-inline-note">
                        <Info size={16} />
                        El NDS del Excel usa 20 s; el contrato requiere NS en 15
                        s.
                      </div>
                    </Panel>
                    <Panel
                      title="Atención por supervisor"
                      description="Llamadas atendidas · período seleccionado"
                    >
                      <div className="r-supervisors">
                        {[...data.supervisors]
                          .sort((a, b) => b.answered - a.answered)
                          .map((s) => (
                            <div key={s.label}>
                              <div>
                                <span>{s.label}</span>
                                <strong>{fmt(s.answered)}</strong>
                              </div>
                              <div className="r-track">
                                <span
                                  style={{
                                    width: `${k?.answered ? (s.answered / k.answered) * 100 : 0}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                      </div>
                    </Panel>
                  </div>
                  <Panel
                    title="Detalle diario"
                    description="Resultados del período seleccionado"
                    action={
                      <button
                        className="r-text-button"
                        onClick={() => setView("metrics")}
                      >
                        Ver todos los indicadores <ArrowUpRight size={14} />
                      </button>
                    }
                  >
                    <DataTable
                      rows={data.daily}
                      label="Fecha"
                      keys={[
                        "received",
                        "answered",
                        "abandoned",
                        "tmo",
                        "tnps",
                        "nda",
                        "nds",
                      ]}
                      dates
                    />
                  </Panel>
                </>
              )}
              {view === "metrics" && (
                <>
                  <Panel
                    title="Tendencia del indicador"
                    description={meta(metric).formula}
                    action={metricSelector}
                  >
                    <Trend rows={data.daily} metric={metric} />
                  </Panel>
                  <div className="r-indicator-catalog">
                    {indicators.map((i) => (
                      <button
                        key={i.key}
                        className={metric === i.key ? "selected" : ""}
                        onClick={() => setMetric(i.key)}
                      >
                        <span>{i.label}</span>
                        <strong>{fmt(k?.[i.key], i.unit)}</strong>
                        <small>{i.formula}</small>
                      </button>
                    ))}
                  </div>
                  <Panel title="Todos los indicadores por día">
                    <DataTable
                      rows={data.daily}
                      label="Fecha"
                      keys={indicators.map((i) => i.key)}
                      dates
                    />
                  </Panel>
                </>
              )}
              {view === "agents" && (
                <>
                  <div className="r-grid-two">
                    <Panel title="Atención por supervisor">
                      <Bars
                        rows={data.supervisors.map((s) => ({
                          ...s,
                          label: s.label.split(" ").slice(0, 2).join(" "),
                        }))}
                      />
                    </Panel>
                    <Panel title="Distribución por dirección">
                      <Bars rows={data.directions} metric="received" />
                    </Panel>
                  </div>
                  <Panel
                    title={`${agents.length} agentes en el período`}
                    description="Ordena los resultados y busca un agente"
                    action={
                      <div className="r-table-tools">
                        <label className="r-search">
                          <Search size={15} />
                          <input
                            aria-label="Buscar agente"
                            placeholder="Buscar agente…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                          />
                        </label>
                        <select
                          aria-label="Ordenar agentes"
                          value={agentSort}
                          onChange={(e) =>
                            setAgentSort(e.target.value as MetricKey)
                          }
                        >
                          {["answered", "tnps", "tmo", "transfer", "cat"].map(
                            (key) => (
                              <option key={key} value={key}>
                                Mayor {meta(key as MetricKey).label}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    }
                  >
                    <DataTable
                      rows={agents}
                      label="Agente"
                      keys={[
                        "received",
                        "answered",
                        "tmo",
                        "tnps",
                        "nps",
                        "tnpsCount",
                        "transfer",
                        "cat",
                        "promoters",
                        "neutrals",
                        "detractors",
                        "nda",
                        "nds",
                      ]}
                    />
                  </Panel>
                </>
              )}
              {view === "intervals" && (
                <>
                  <Panel
                    title="Demanda por franja de 30 minutos"
                    description="Suma de las mismas franjas en los días seleccionados. Filtra un solo día para el detalle diario."
                  >
                    <Bars rows={data.slots} metric="received" />
                  </Panel>
                  <Panel
                    title="Indicadores por franja"
                    description="Las tasas se recalculan desde los numeradores y denominadores."
                  >
                    <DataTable
                      rows={data.slots}
                      label="Franja"
                      keys={[
                        "received",
                        "answered",
                        "abandoned",
                        "tmo",
                        "nda",
                        "nds",
                        "avh2",
                        "ns15",
                      ]}
                    />
                  </Panel>
                  <Panel title="Distribución por cola">
                    <DataTable
                      rows={data.skills}
                      label="Cola"
                      keys={["received", "answered", "tmo", "tnps", "cat"]}
                    />
                  </Panel>
                </>
              )}
              {view === "contract" && (
                <>
                  <div className="r-callout">
                    <ShieldCheck size={22} />
                    <div>
                      <strong>Condiciones comerciales 2026</strong>
                      <p>
                        Comparación operativa con el documento. No aplica
                        penalidades ni excepciones de tráfico: faltan horas
                        reales y adherencia.
                      </p>
                    </div>
                    <a
                      href="/docs/condiciones-full-claro-2026.pdf"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver PDF <ArrowUpRight size={15} />
                    </a>
                  </div>
                  <Panel
                    title="Seguimiento de objetivos"
                    description={
                      month
                        ? `Período: ${month}`
                        : "Selecciona un solo mes para evaluar metas mensuales."
                    }
                  >
                    <div className="r-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Indicador</th>
                            <th>Resultado</th>
                            <th>Objetivo</th>
                            <th>Lectura</th>
                            <th>Criterio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {goalRows.map((r, i) => {
                            const known =
                              r.value !== null &&
                              r.value !== undefined &&
                              r.target !== null;
                            const pass =
                              known &&
                              (r.less
                                ? r.value! <= r.target!
                                : r.value! >= r.target!);
                            return (
                              <tr key={r.name}>
                                <td>{r.name}</td>
                                <td>
                                  {fmt(r.value, r.unit as Indicator["unit"])}
                                </td>
                                <td>{r.label}</td>
                                <td>
                                  <span
                                    className={
                                      i >= 4
                                        ? "r-neutral"
                                        : !known
                                          ? "r-neutral"
                                          : pass
                                            ? "r-good"
                                            : "r-bad"
                                    }
                                  >
                                    {i >= 4
                                      ? "Referencial"
                                      : !known
                                        ? "Sin evaluación"
                                        : i === 3 &&
                                            k?.transfer !== null &&
                                            k!.transfer! < 82
                                          ? "Condicionado"
                                          : pass
                                            ? "En objetivo"
                                            : "Fuera de objetivo"}
                                  </span>
                                </td>
                                <td className="r-wrap">{r.note}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                  <Panel title="Indicadores que necesitan otra fuente">
                    <div className="r-missing-grid">
                      {[
                        [
                          "Adherencia por franja",
                          "≥ 95%",
                          "Logueo neto, idle y horas reales por intervalo, cruzados con dimensionamiento.",
                        ],
                        [
                          "Ocupación",
                          "≥ 63%",
                          "Logueo neto, bruto y auxiliares.",
                        ],
                        [
                          "Calidad emitida",
                          "Meta mensual",
                          "Evaluaciones de calidad. El PDF muestra 95% ago–set y 96% oct–dic, además de un encabezado de 85%; requiere aclaración.",
                        ],
                        [
                          "Rellamado D+1",
                          "< 18% ago–set; < 17% oct–dic",
                          "Identificador estable de cliente y reglas de rellamada. ID de llamada no identifica al cliente.",
                        ],
                        [
                          "Rotación",
                          "< 12%",
                          "Bajas y dotación del período. La nómina es una fotografía.",
                        ],
                        [
                          "Estructura operativa",
                          "Ratios por rol",
                          "Dotación vigente por rol y equivalencias full time.",
                        ],
                        [
                          "NS por intervalos",
                          "36 de 48 intervalos",
                          "Validación del tiempo de atención, horas reales y excepciones. El PDF también menciona 27 intervalos en p. 5.",
                        ],
                        [
                          "Retribución fija",
                          "S/ 22 por hora",
                          "Horas facturables autorizadas. El tiempo de conversación no equivale a horas facturables.",
                        ],
                      ].map(([title, target, note]) => (
                        <article key={title}>
                          <span className="r-pill">Pendiente de datos</span>
                          <h3>{title}</h3>
                          <strong>{target}</strong>
                          <p>{note}</p>
                        </article>
                      ))}
                    </div>
                  </Panel>
                </>
              )}
              {view === "source" && (
                <>
                  <Panel
                    title="Archivo importado"
                    description="Cada archivo conserva una versión. Cargar el mismo archivo no duplica registros."
                  >
                    <div className="r-source-info">
                      <FileSpreadsheet size={34} />
                      <div>
                        <strong>{data.filename}</strong>
                        <p>
                          {fmt(data.totalRecords)} interacciones ·{" "}
                          {shortDate(data.dates[0])} –{" "}
                          {shortDate(data.dates.at(-1)!)} ·{" "}
                          {data.sheets.length + 1} hojas
                        </p>
                      </div>
                      <select
                        aria-label="Importación"
                        value={data.id}
                        onChange={(e) => setFilters({ id: e.target.value })}
                      >
                        {imports.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.id} · {i.filename}
                          </option>
                        ))}
                      </select>
                    </div>
                    {data.warnings.map((w) => (
                      <p className="r-inline-note" key={w}>
                        <Info size={16} />
                        {w}
                      </p>
                    ))}
                  </Panel>
                  <Panel
                    title="Conciliación con la hoja Diario"
                    description="Total guardado del Excel frente a toda la trazabilidad importada, sin filtros del dashboard."
                  >
                    <div className="r-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Indicador</th>
                            <th>Excel</th>
                            <th>Recalculado</th>
                            <th>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.reconciliation.map((r) => (
                            <tr key={r.metric}>
                              <td>
                                {meta(r.metric as MetricKey)?.label ?? r.metric}
                              </td>
                              <td>
                                {fmt(
                                  r.source,
                                  meta(r.metric as MetricKey)?.unit,
                                )}
                              </td>
                              <td>
                                {fmt(
                                  r.calculated,
                                  meta(r.metric as MetricKey)?.unit,
                                )}
                              </td>
                              <td>
                                <span
                                  className={r.matches ? "r-good" : "r-bad"}
                                >
                                  {r.matches
                                    ? "Coincide"
                                    : "Diferencia / revisar filtros del Excel"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                  <Panel
                    title="Explorador de hojas originales"
                    description="Valores guardados. Esta vista conserva los filtros originales del Excel; no cambia con los filtros del dashboard."
                    action={
                      <select
                        aria-label="Hoja original"
                        value={sheet}
                        onChange={(e) => setSheet(e.target.value)}
                      >
                        {data.sheets.map((s) => (
                          <option key={s.name}>{s.name}</option>
                        ))}
                      </select>
                    }
                  >
                    <div className="r-table-scroll r-sheet-table">
                      <table>
                        <tbody>
                          {data.sheets
                            .find((s) => s.name === sheet)
                            ?.rows.map((r, i) => (
                              <tr key={i}>
                                {r.map((cell, j) => (
                                  <td key={j}>
                                    {typeof cell === "number"
                                      ? new Intl.NumberFormat("es-PE", {
                                          maximumFractionDigits: 4,
                                        }).format(cell)
                                      : (cell ?? "—")}
                                  </td>
                                ))}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                </>
              )}
            </div>
          )}
          <footer className="r-footer">
            <span>
              Full Claro Black <span>·</span> Inteligencia operativa
            </span>
            <span>
              Gráficos con{" "}
              <a href="https://bklit.com/" target="_blank" rel="noreferrer">
                Bklit UI
              </a>{" "}
              ↗
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function DataTable({
  rows,
  label,
  keys,
  dates = false,
}: {
  rows: Group[];
  label: string;
  keys: MetricKey[];
  dates?: boolean;
}) {
  return (
    <div className="r-table-scroll">
      <table>
        <thead>
          <tr>
            <th>{label}</th>
            {keys.map((key) => (
              <th key={key} title={meta(key).formula}>
                {meta(key).label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{dates ? shortDate(r.label) : r.label}</td>
              {keys.map((key) => (
                <td key={key}>{fmt(r[key], meta(key).unit)}</td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={keys.length + 1}>
                No hay registros para los filtros seleccionados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
