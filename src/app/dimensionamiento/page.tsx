"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import {
  BarChart,
} from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { Grid } from "@/components/charts/grid";
import {
  Line,
  LineChart,
} from "@/components/charts/line-chart";
import { XAxis } from "@/components/charts/x-axis";

type Point = { date?: string; week?: string; month?: string; calls: number; hours: number; advisors: number };
type Interval = { timeSlot: string; calls: number; hours: number; advisors: number; tmg: number };
type DashboardData = {
  daily: Point[];
  weekly: Point[];
  monthly: Point[];
  kpis: { calls: number; hours: number; advisors: number; weightedTmg: number };
  availableMonths: string[];
  detailDate: string;
  intervals: Interval[];
};

const initialData: DashboardData = {
  daily: [],
  weekly: [],
  monthly: [],
  kpis: { calls: 0, hours: 0, advisors: 0, weightedTmg: 0 },
  availableMonths: [],
  detailDate: "",
  intervals: [],
};

const number = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const slotNumber = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 6 });

export default function Home() {
  const [campaign, setCampaign] = useState("FULL CLARO");
  const [month, setMonth] = useState("2026-11");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [data, setData] = useState<DashboardData>(initialData);
  const [selectedDate, setSelectedDate] = useState("");
  const [message, setMessage] = useState("Carga un Excel para ver el dashboard.");
  const [loading, setLoading] = useState(false);

  async function loadDashboard(targetMonth = month, targetCampaign = campaign, targetDate = selectedDate) {
    setLoading(true);
    try {
      const dateParameter = targetDate ? `&date=${targetDate}` : "";
      const response = await fetch(
        `/api/dashboard?campaign=${encodeURIComponent(targetCampaign)}&month=${targetMonth}${dateParameter}&refresh=${Date.now()}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo cargar el dashboard.");
      setData(result);
      setSelectedDate(result.detailDate || "");
      setMessage(result.daily.length ? `Mostrando ${result.daily.length} días de ${targetMonth}.` : `No hay dimensiones cargadas para ${targetMonth}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
    // La carga inicial consulta la campaña y mes mostrados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setMessage("Selecciona primero el Excel de dimensionamiento.");
      return;
    }
    setLoading(true);
    setMessage("Leyendo Detalle Franjas e importando las 48 franjas por día...");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("campaign", campaign);
      const response = await fetch("/api/imports", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo importar el archivo.");
      setCampaign(result.campaignName);
      setMonth(result.periodMonth);
      await loadDashboard(result.periodMonth, result.campaignName);
      const warning = result.warnings.length ? ` Aviso: ${result.warnings.join(" ")}` : "";
      setMessage(`Se guardaron ${result.importedRows} franjas de ${result.periodMonth}.${warning}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo importar el archivo.");
    } finally {
      setLoading(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  const dailyChart = data.daily.map((point) => ({
    ...point,
    date: new Date(`${point.date}T00:00:00`),
  }));
  const monthlyChart = data.monthly.map((point) => ({ ...point, label: point.month }));
  const intervalChart = data.intervals.map((point) => {
    const [hour, minute] = point.timeSlot.split(":").map(Number);
    return { ...point, date: new Date(2026, 0, 1, hour, minute) };
  });
  const hasData = data.daily.length > 0;

  return (
    <main>
      <a href="/" style={{ display: 'inline-block', marginBottom: 20, color: '#d32f39' }}>← Volver a reportería Full Claro</a>
      <section className="hero">
        <div>
          <p className="eyebrow">A365 · Planificación</p>
          <h1>Dimensionamiento Full Claro</h1>
          <p>Sube el archivo mensual. El sistema almacena cada franja de 30 minutos y resume la demanda diaria, semanal y mensual.</p>
        </div>
        <form className="upload-card" onSubmit={upload}>
          <label>
            Campaña
            <input value={campaign} onChange={(event) => setCampaign(event.target.value)} maxLength={120} required />
          </label>
          <label>
            Excel de dimensionamiento
            <input type="file" accept=".xlsx" onChange={onFileChange} required />
          </label>
          <button type="submit" disabled={loading}>{loading ? "Procesando..." : "Importar dimensiones"}</button>
          <small>Se espera la hoja <strong>Detalle Franjas</strong> y el bloque <strong>FULL CLARO</strong>.</small>
        </form>
      </section>

      <section className="filters" aria-label="Filtros del dashboard">
        <label>
          Mes de análisis
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
        <button type="button" className="secondary" onClick={() => void loadDashboard()} disabled={loading}>Actualizar dashboard</button>
        <span className="status">{message}</span>
      </section>

      <section className="kpis">
        <article><span>Llamadas previstas</span><strong>{hasData ? number.format(data.kpis.calls) : "—"}</strong><small>Total del mes seleccionado</small></article>
        <article><span>Horas dimensionadas</span><strong>{hasData ? decimal.format(data.kpis.hours) : "—"}</strong><small>Suma de todas las franjas</small></article>
        <article><span>Máximo de asesores</span><strong>{hasData ? decimal.format(data.kpis.advisors) : "—"}</strong><small>Pico requerido en una franja</small></article>
        <article><span>TMG planificado</span><strong>{hasData ? `${number.format(data.kpis.weightedTmg)} s` : "—"}</strong><small>Promedio ponderado por llamadas</small></article>
      </section>

      <section className="charts">
        <ChartCard title="Llamadas previstas por día">
          <LineChart data={dailyChart} aspectRatio="2 / 1">
            <Grid horizontal />
            <Line dataKey="calls" stroke="#1b5e93" strokeWidth={3} />
            <XAxis />
            <ChartTooltip />
          </LineChart>
        </ChartCard>
        <ChartCard title="Horas dimensionadas por semana">
          <BarChart data={data.weekly} xDataKey="week" aspectRatio="2 / 1">
            <Grid horizontal />
            <Bar dataKey="hours" fill="#42a5a0" lineCap="round" />
            <BarXAxis />
            <ChartTooltip />
          </BarChart>
        </ChartCard>
        <ChartCard title="Pico de asesores por día">
          <BarChart data={data.daily.map((point) => ({ ...point, day: point.date?.slice(8, 10) }))} xDataKey="day" aspectRatio="2 / 1">
            <Grid horizontal />
            <Bar dataKey="advisors" fill="#f4a261" lineCap="round" />
            <BarXAxis />
            <ChartTooltip />
          </BarChart>
        </ChartCard>
        <ChartCard title="Tendencia mensual de llamadas">
          <BarChart data={monthlyChart} xDataKey="label" aspectRatio="2 / 1">
            <Grid horizontal />
            <Bar dataKey="calls" fill="#7e57c2" lineCap="round" />
            <BarXAxis />
            <ChartTooltip />
          </BarChart>
        </ChartCard>
      </section>

      <section className="table-card">
        <h2>Resumen diario</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Fecha</th><th>Llamadas previstas</th><th>Horas dimensionadas</th><th>Pico de asesores</th></tr></thead>
            <tbody>
              {data.daily.map((row) => <tr key={row.date}><td>{row.date}</td><td>{number.format(row.calls)}</td><td>{decimal.format(row.hours)}</td><td>{decimal.format(row.advisors)}</td></tr>)}
              {!data.daily.length && <tr><td colSpan={4}>Aún no hay información para este mes.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-card">
        <div className="detail-heading">
          <div>
            <h2>Detalle de llamadas previstas por franja</h2>
            <p>Cada fila corresponde a una franja de 30 minutos del día seleccionado.</p>
          </div>
          <label>
            Día a revisar
            <select
              value={selectedDate}
              onChange={(event) => {
                const date = event.target.value;
                setSelectedDate(date);
                void loadDashboard(month, campaign, date);
              }}
              disabled={loading || !data.daily.length}
            >
              {data.daily.map((row) => <option key={row.date} value={row.date}>{row.date}</option>)}
            </select>
          </label>
        </div>
        <div className="interval-chart" aria-label="Gráfico de llamadas previstas por franja">
          <LineChart data={intervalChart} aspectRatio="3 / 1">
            <Grid horizontal />
            <Line dataKey="calls" stroke="#1b5e93" strokeWidth={3} />
            <ChartTooltip
              showDatePill={false}
              content={({ point }) => <span><strong>{String(point.timeSlot)}</strong><br />{slotNumber.format(Number(point.calls))} llamadas previstas</span>}
            />
          </LineChart>
          <div className="time-axis" aria-hidden="true"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:30</span></div>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Franja</th><th>Llamadas previstas</th><th>Horas dimensionadas</th><th>Asesores requeridos</th><th>TMG (s)</th></tr></thead>
            <tbody>
              {data.intervals.map((row) => <tr key={row.timeSlot}><td>{row.timeSlot}</td><td>{slotNumber.format(row.calls)}</td><td>{decimal.format(row.hours)}</td><td>{decimal.format(row.advisors)}</td><td>{number.format(row.tmg)}</td></tr>)}
              {!data.intervals.length && <tr><td colSpan={5}>Selecciona un día con información cargada.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <article className="chart-card"><h2>{title}</h2>{children}</article>;
}
