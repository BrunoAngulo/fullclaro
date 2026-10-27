"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDown, ArrowUp, CalendarDays, Check, CheckCircle2, Clipboard, Clock3, XCircle, Users } from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { Line, LineChart } from "@/components/charts/line-chart";
import { GtrSettingsDrawer } from "@/components/gtr-settings-drawer";

type Row = Record<string, string | number | null>;
type Data = { fecha: string; resumen: Row | null; tramos: Row[]; modalidad: Row[]; asesores: Row[]; encuestas: Row | null; objetivos: Row[]; error?: string };
const number = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 });
const percent = (value: unknown) => value === null || value === undefined ? "—" : `${number.format(Number(value) * 100)}%`;
const value = (v: unknown) => v === null || v === undefined ? "—" : number.format(Number(v));

export default function GtrDashboard({ initialFecha }: { initialFecha: string }) {
  const [fecha, setFecha] = useState(initialFecha);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const tramosTableRef = useRef<HTMLTableElement>(null);
  const modalidadTableRef = useRef<HTMLTableElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setData(null);
    fetch(`/api/gtr?fecha=${fecha}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); setData(result); })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [fecha, refreshKey]);
  const r = data?.resumen;
  const e = data?.encuestas;
  const objetivo = (codigo: string) => (data?.objetivos ?? []).find((item) => item.Codigo === codigo);
  const todosLosTramos = (data?.tramos ?? []).filter((row) => row.Tramo !== "Total");
  // El dimensionado contiene todo el día. Para operación, solo mostramos hasta el último
  // tramo que ya tiene una interacción registrada, sin esconder los ceros intermedios.
  const ultimoTramoConActividad = todosLosTramos.reduce((last, row, index) => {
    const actividad = [row.Recibidas, row.Atendidas, row.Abandonadas, row.Salientes, row["Q Tx Encuesta"]]
      .some((metric) => Number(metric ?? 0) > 0);
    return actividad ? index : last;
  }, -1);
  const tramos = ultimoTramoConActividad >= 0 ? todosLosTramos.slice(0, ultimoTramoConActividad + 1) : [];
  const totalTramos = (data?.tramos ?? []).find((row) => row.Tramo === "Total");
  const ultimoTramo = tramos.at(-1)?.Tramo;
  const dimensionadasAlCorte = tramos.reduce((sum, row) => sum + Number(row.Dimensionadas ?? 0), 0);
  const dimensionadasDelDia = Number(totalTramos?.Dimensionadas ?? r?.Dimensionadas ?? 0);
  const chart = tramos.map((row) => ({ tramo: row.Tramo, dimensionadas: Number(row.Dimensionadas ?? 0), recibidas: Number(row.Recibidas ?? 0), atendidas: Number(row.Atendidas ?? 0) }));
  const qualityChart = tramos.map((row) => ({ date: new Date(`${fecha}T${String(row.Tramo)}`), tramo: row.Tramo, na: Number(row["%NA"] ?? 0) * 100, ns: Number(row["%NS"] ?? 0) * 100, cat: Number(row["%CAT"] ?? 0) * 100 }));
  const tnpsChart = tramos.filter((row) => row["%TNPS"] !== null).map((row) => ({ date: new Date(`${fecha}T${String(row.Tramo)}`), tramo: row.Tramo, tnps: Number(row["%TNPS"]) * 100 }));
  const modalidadVisible = (data?.modalidad ?? []).filter((row) => row.Tipo === "Presencial" || row.Tipo === "Remoto" || row.Tipo === "TOTAL");
  const modalidadChart = modalidadVisible.filter((row) => typeof row.Agente === "string" && row.Agente.startsWith("TOTAL ") && (row.Tipo === "Presencial" || row.Tipo === "Remoto")).map((row) => ({ modalidad: row.Tipo, recibidas: Number(row.Recibidas ?? 0), atendidas: Number(row.Atendidas ?? 0) }));
  return <main className="report-app"><div className="r-content"><div className="r-topbar"><div><GtrSettingsDrawer onImported={() => setRefreshKey((current) => current + 1)} /><strong>GTR Full Claro</strong></div><span className="r-top-status"><i />Conexión local</span></div><section className="r-main">
    <div className="r-heading"><div><h1>Indicadores de Full Claro</h1></div><label className="r-actions"><CalendarDays size={16}/><input aria-label="Fecha" type="date" value={fecha} onChange={(e) => { if (e.target.value) setFecha(e.target.value); }} /></label></div>
    {error && <div className="r-error">{error}</div>}
    <div className="r-kpis"><Card icon={<Activity size={16}/>} label="Dimensionadas" value={`${value(dimensionadasAlCorte)} / ${value(dimensionadasDelDia)}`} detail={ultimoTramo ? `Hasta ${String(ultimoTramo).slice(0, 5)} · plan del día` : "Plan del día"} /><Card icon={<Activity size={16}/>} label="Recibidas" value={value(r?.Recibidas)} /><Card icon={<Users size={16}/>} label="Atendidas" value={value(r?.Atendidas)} /><Card icon={<Clock3 size={16}/>} label="Nivel de servicio" value={percent(r?.["%NS"])} goal={objetivo("NS")} /><Card icon={<Activity size={16}/>} label="Abandono" value={percent(r?.["%Abandono"])} /><Card icon={<Activity size={16}/>} label="CAT" value={percent(r?.["%CAT"])} goal={objetivo("CAT")} /><Card icon={<Clock3 size={16}/>} label="TMG" value={formatDuration(r?.TMG_Segundos)} goal={objetivo("TMG")} /><Card icon={<Activity size={16}/>} label="TNPS" value={percent(r?.["%TNPS"])} goal={objetivo("TNPS")} /><Card icon={<Activity size={16}/>} label="Encuestas TNPS" value={value(e?.Encuestas)} /><Card icon={<Activity size={16}/>} label="Promotores" value={value(e?.Promotores)} /><Card icon={<Activity size={16}/>} label="Neutros" value={value(e?.Neutros)} /><Card icon={<Activity size={16}/>} label="Detractores" value={value(e?.Detractores)} /></div>
    <section className="r-panel r-traffic-panel"><div className="r-panel-head"><div><h2>Tráfico por tramo</h2><p>Dimensionadas, recibidas y atendidas durante todo el día.</p></div><div className="r-legend"><span><i className="r-dim-dot"/>Dimensionadas</span><span><i className="r-rec-dot"/>Recibidas</span><span><i className="r-att-dot"/>Atendidas</span></div></div>{chart.length ? <BarChart data={chart} xDataKey="tramo" aspectRatio="4 / 1"><Grid horizontal stroke="#edf0f3"/><Bar dataKey="dimensionadas" fill="#aab3c2" lineCap="round"/><Bar dataKey="recibidas" fill="#e3343a" lineCap="round"/><Bar dataKey="atendidas" fill="#18243a" lineCap="round"/><BarXAxis/><ChartTooltip/></BarChart> : <p className="r-empty">Sin tramos para esta fecha.</p>}</section>
    <section className="r-charts-grid">
      <div className="r-panel"><div className="r-panel-head"><div><h2>Nivel de servicio y calidad</h2><p>NA, NS y CAT por cada tramo (%).</p></div><div className="r-legend"><span><i className="r-na-dot"/>NA</span><span><i className="r-ns-dot"/>NS</span><span><i className="r-cat-dot"/>CAT</span></div></div>{qualityChart.length ? <><LineChart data={qualityChart} aspectRatio="2 / 1"><Grid horizontal stroke="#edf0f3"/><Line dataKey="na" stroke="#1b5e93" strokeWidth={2.5}/><Line dataKey="ns" stroke="#2e9d73" strokeWidth={2.5}/><Line dataKey="cat" stroke="#e3343a" strokeWidth={2.5}/><ChartTooltip showDatePill={false} content={({point}) => <span><strong>{String(point.tramo)}</strong><br/>NA {Number(point.na).toFixed(1)}% · NS {Number(point.ns).toFixed(1)}% · CAT {Number(point.cat).toFixed(1)}%</span>}/></LineChart><TimeAxis/></> : <p className="r-empty">Sin indicadores para esta fecha.</p>}</div>
      <div className="r-panel"><div className="r-panel-head"><div><h2>TNPS por tramo</h2><p>Promotores menos detractores, por intervalo (%).</p></div></div>{tnpsChart.length ? <><LineChart data={tnpsChart} aspectRatio="2 / 1"><Grid horizontal stroke="#edf0f3"/><Line dataKey="tnps" stroke="#8256c5" strokeWidth={2.5}/><ChartTooltip showDatePill={false} content={({point}) => <span><strong>{String(point.tramo)}</strong><br/>TNPS {Number(point.tnps).toFixed(1)}%</span>}/></LineChart><TimeAxis/></> : <p className="r-empty">Sin encuestas para esta fecha.</p>}</div>
      <div className="r-panel r-modalidad-chart"><div className="r-panel-head"><div><h2>Tráfico por modalidad</h2><p>Totales de Presencial y Remoto del día.</p></div></div>{modalidadChart.length ? <BarChart data={modalidadChart} xDataKey="modalidad" aspectRatio="2 / 1"><Grid horizontal stroke="#edf0f3"/><Bar dataKey="recibidas" fill="#e3343a" lineCap="round"/><Bar dataKey="atendidas" fill="#18243a" lineCap="round"/><BarXAxis/><ChartTooltip/></BarChart> : <p className="r-empty">Sin modalidades para esta fecha.</p>}</div>
    </section>
    <section className="r-panel r-tramos-panel"><div className="r-panel-head"><div><div className="r-panel-title-row"><h2>Detalle por tramo</h2><TableCopyButton tableRef={tramosTableRef}/></div><p>Lectura operativa hasta el último tramo con datos cargados. <MetaLegend /></p></div><span className="r-tramos-count">{tramos.length} intervalos</span></div><DetallePorTramo rows={totalTramos ? [...tramos, totalTramos] : tramos} tableRef={tramosTableRef} /></section>
    <section className="r-panel"><div className="r-panel-head"><div><div className="r-panel-title-row"><h2>Resultado por supervisor y asesor</h2><TableCopyButton tableRef={modalidadTableRef}/></div><p>Asesores agrupados según el supervisor de la Dotación vigente. <MetaLegend /></p></div></div><ResultadoPorSupervisor rows={data?.asesores ?? []} tableRef={modalidadTableRef} /></section>
  </section></div></main>;
}
function TimeAxis() { return <div className="r-time-axis" aria-hidden="true"><span>06:00</span><span>10:00</span><span>14:00</span><span>18:00</span><span>23:30</span></div>; }
function Card({ icon, label, value: content, goal, detail }: { icon: React.ReactNode; label: string; value: string; goal?: Row; detail?: string }) {
  const target = goal?.Codigo === "TMG" ? formatDuration(goal.Objetivo) : percent(goal?.Objetivo);
  const cumple = Number(goal?.Cumple ?? 0) === 1;
  return <article className={goal ? (cumple ? "r-kpi-cumple" : "r-kpi-no-cumple") : ""}>
    <div className="r-kpi-top"><span>{label}</span>{goal ? <span className={`r-goal-icon ${cumple ? "r-goal-icon-ok" : "r-goal-icon-bad"}`} title={cumple ? "Meta cumplida según SQL Server" : "Meta no cumplida según SQL Server"}>{cumple ? <CheckCircle2 size={18}/> : <XCircle size={18}/>}</span> : icon}</div>
    <strong>{content}</strong>
    <div className="r-kpi-foot">{goal ? <span className={cumple ? "r-good" : "r-bad"}>{cumple ? <CheckCircle2 size={12}/> : <XCircle size={12}/>} {cumple ? "Meta cumplida" : "Bajo meta"} · {goal.Operador} {target}</span> : <span className="r-neutral">{detail ?? "SP SQL Server"}</span>}</div>
  </article>;
}
function formatDuration(seconds: unknown) { const total = Math.round(Number(seconds)); if (!Number.isFinite(total)) return "—"; const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60); const s = total % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; }
function MetaLegend() { return <span className="r-meta-legend"><i className="r-meta-legend-up"><ArrowUp size={11}/></i> Sobre meta · <i className="r-meta-legend-down"><ArrowDown size={11}/></i> Bajo meta</span>; }
function MetaValue({ children, cumple }: { children: React.ReactNode; cumple: unknown }) {
  const evaluable = cumple !== null && cumple !== undefined && cumple !== "";
  if (!evaluable) return <>{children}</>;
  const ok = Number(cumple) === 1;
  return <span className={`r-table-meta ${ok ? "r-table-meta-ok" : "r-table-meta-bad"}`} title={ok ? "Meta cumplida según SQL Server" : "Meta no cumplida según SQL Server"}><i>{ok ? <ArrowUp size={11}/> : <ArrowDown size={11}/>}</i>{children}</span>;
}
function VariacionTrafico({ row }: { row: Row }) {
  const dimensionadas = Number(row.Dimensionadas ?? 0);
  const recibidas = Number(row.Recibidas ?? 0);
  const rawValue = row["%Var"];
  const raw = Number(rawValue);
  const sinMeta = dimensionadas === 0 && recibidas > 0;
  if (!sinMeta && (rawValue === null || rawValue === undefined || rawValue === "" || !Number.isFinite(raw))) {
    return <span className="r-traffic-variation r-traffic-variation-neutral" title="No hay variación calculable">—</span>;
  }
  const positive = sinMeta || raw >= 0;
  const label = sinMeta ? `+${value(recibidas)}` : percent(raw);
  const detail = sinMeta ? `${value(recibidas)} recibidas con dimensionamiento cero; no existe porcentaje de variación.` : `Variación de ${label} frente al dimensionamiento.`;
  return <span className={`r-traffic-variation ${positive ? "r-traffic-variation-up" : "r-traffic-variation-down"}`} title={detail}><i>{positive ? <ArrowUp size={8}/> : <ArrowDown size={8}/>}</i><b>{label}</b></span>;
}
function DetallePorTramo({ rows, tableRef }: { rows: Row[]; tableRef: React.RefObject<HTMLTableElement | null> }) {
  const total = rows.find((row) => row.Tramo === "Total");
  const intervalos = rows.filter((row) => row.Tramo !== "Total");
  const headers = ["Tramo", "Dim.", "Rec.", "Atend.", "Var.", "Aband.", "% Aband.", "Sal.", "<15 s", "CAT", "% CAT", "% NA", "% NS", "TMG", "Tx.", "Part.", "TNPS"];
  const cells = (row: Row) => [
    String(row.Tramo ?? "—"), value(row.Dimensionadas), value(row.Recibidas), value(row.Atendidas), <VariacionTrafico row={row} />,
    value(row.Abandonadas), percent(row["%Abandono"]), value(row.Salientes), value(row["Atendidas<15"]), value(row["CAT CANTIDAD"]),
    <MetaValue cumple={row.CumpleCAT}>{percent(row["%CAT"])}</MetaValue>, percent(row["%NA"]), <MetaValue cumple={row.CumpleNS}>{percent(row["%NS"])}</MetaValue>, <MetaValue cumple={row.CumpleTMG}>{formatDuration(row.TMG_Segundos)}</MetaValue>, value(row["Q Tx Encuesta"]),
    percent(row["%Part. Encuesta"]), <MetaValue cumple={row.CumpleTNPS}>{percent(row["%TNPS"])}</MetaValue>,
  ];
  if (!rows.length) return <p className="r-empty">Sin tramos para esta fecha.</p>;
  return <div className="r-tramos-table-frame"><table ref={tableRef} className="r-tramos-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>
    {intervalos.map((row, index) => <tr key={`${row.Tramo ?? index}`}>{cells(row).map((cell, cellIndex) => <td key={headers[cellIndex]}>{cell}</td>)}</tr>)}
    {total && <tr className="r-tramos-total">{cells(total).map((cell, cellIndex) => <td key={headers[cellIndex]}>{cell}</td>)}</tr>}
  </tbody></table></div>;
}
function ResultadoPorSupervisor({ rows, tableRef }: { rows: Row[]; tableRef: React.RefObject<HTMLTableElement | null> }) {
  const [sort, setSort] = useState<{ index: number; direction: "asc" | "desc" }>({ index: 0, direction: "asc" });
  const headers = ["Agente", "TMO", "Neutro.", "% TNPS", "% NPS", "% Transfer.", "Promotor", "Detractor", "Cat %"];
  const sortValues = (row: Row) => [row.Agente, row.TMO_Segundos, row.Neutros, row["%TNPS"], row["%NPS"], row["%TRANSFER."], row.Promotores, row.Detractores, row["Cat %"]];
  const cells = (row: Row) => [
    String(row.Agente ?? "—"), formatDuration(row.TMO_Segundos), value(row.Neutros), <MetaValue cumple={row.CumpleTNPS}>{percent(row["%TNPS"])}</MetaValue>, percent(row["%NPS"]), percent(row["%TRANSFER."]), value(row.Promotores), value(row.Detractores), <MetaValue cumple={row.CumpleCAT}>{percent(row["Cat %"])}</MetaValue>,
  ];
  const groups = useMemo(() => Array.from(new Set(rows.map((row) => String(row.Supervisor ?? "SIN SUPERVISOR")))).sort((a, b) => a.localeCompare(b, "es")).map((supervisor) => {
    const total = rows.find((row) => String(row.Supervisor ?? "") === supervisor && Number(row.EsTotalSupervisor) === 1);
    const detail = rows.filter((row) => String(row.Supervisor ?? "") === supervisor && Number(row.EsTotalSupervisor) !== 1).sort((a, b) => {
      const left = sortValues(a)[sort.index]; const right = sortValues(b)[sort.index];
      const comparison = typeof left === "number" && typeof right === "number" ? left - right : String(left ?? "").localeCompare(String(right ?? ""), "es");
      return sort.direction === "asc" ? comparison : -comparison;
    });
    return { supervisor, total, detail };
  }).filter((group) => group.detail.length > 0), [rows, sort]);
  const toggleSort = (index: number) => setSort((current) => current.index === index ? { index, direction: current.direction === "asc" ? "desc" : "asc" } : { index, direction: "desc" });
  return <div className="r-modalidad-table-frame"><table ref={tableRef} className="r-modalidad-table r-supervisor-table"><colgroup>{headers.map((header) => <col key={header}/>)}</colgroup><thead><tr>{headers.map((header, index) => <th key={header}><button type="button" onClick={() => toggleSort(index)} title={`Ordenar por ${header}`}>{header}</button></th>)}</tr></thead><tbody>
    {groups.flatMap((group) => [group.total ? <tr className="r-modalidad-total r-supervisor-total" key={`total-${group.supervisor}`}>{cells(group.total).map((cell, index) => <td key={headers[index]}>{index === 0 ? <><span className="r-supervisor-marker">⌄</span>{cell}</> : cell}</td>)}</tr> : null, ...group.detail.map((row, index) => <tr key={`${group.supervisor}-${row.Agente ?? index}`}><td className="r-modalidad-agent r-supervisor-agent">{cells(row)[0]}</td>{cells(row).slice(1).map((cell, cellIndex) => <td className="r-modalidad-value" key={headers[cellIndex + 1]}>{cell}</td>)}</tr>)])}
    {!groups.length && <tr><td colSpan={headers.length}>Sin asesores con actividad para esta fecha.</td></tr>}
  </tbody></table></div>;
}

function TableCopyButton({ tableRef }: { tableRef: React.RefObject<HTMLTableElement | null> }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const copy = async () => {
    if (!tableRef.current) return;
    try { await copyTableImage(tableRef.current); setState("copied"); window.setTimeout(() => setState("idle"), 2200); }
    catch { setState("error"); window.setTimeout(() => setState("idle"), 3200); }
  };
  const label = state === "copied" ? "Imagen copiada" : state === "error" ? "No se pudo copiar" : "Copiar como imagen";
  return <button type="button" className={`r-copy-table ${state === "error" ? "r-copy-table-error" : ""}`} onClick={copy} title={label} aria-label={label}>{state === "copied" ? <Check size={13}/> : <Clipboard size={13}/>}</button>;
}

async function copyTableImage(table: HTMLTableElement) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas no disponible");
  const bounds = table.getBoundingClientRect();
  const scale = 2, width = Math.ceil(bounds.width), height = Math.ceil(bounds.height);
  canvas.width = width * scale; canvas.height = height * scale;
  context.scale(scale, scale); context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); context.textBaseline = "middle";
  const transparent = (color: string) => color === "transparent" || color === "rgba(0, 0, 0, 0)";
  for (const cell of Array.from(table.querySelectorAll<HTMLTableCellElement>("th, td"))) {
    const rect = cell.getBoundingClientRect(); const css = getComputedStyle(cell); const rowCss = getComputedStyle(cell.parentElement!);
    const x = rect.left - bounds.left, y = rect.top - bounds.top, w = rect.width, h = rect.height;
    context.fillStyle = transparent(css.backgroundColor) ? (transparent(rowCss.backgroundColor) ? "#ffffff" : rowCss.backgroundColor) : css.backgroundColor;
    context.fillRect(x, y, w, h); context.strokeStyle = css.borderColor || "#dfe6ee"; context.strokeRect(x, y, w, h);
    const meta = cell.querySelector(".r-table-meta"); const variation = cell.querySelector(".r-traffic-variation");
    const text = cell.textContent?.trim() ?? ""; if (!text) continue;
    const fontSize = Math.max(7, parseFloat(css.fontSize) || 9); context.font = `${css.fontWeight || 600} ${fontSize}px Arial`; context.fillStyle = css.color || "#2e3d50";
    const horizontal = css.textAlign === "left" ? x + 3 : x + w / 2; context.textAlign = css.textAlign === "left" ? "left" : "center";
    context.save(); context.beginPath(); context.rect(x + 1, y + 1, w - 2, h - 2); context.clip();
    if (cell.classList.contains("r-modalidad-group-name")) { context.translate(x + w / 2, y + h / 2); context.rotate(-Math.PI / 2); context.textAlign = "center"; context.fillText(text, 0, 0, h - 4); }
    else if (variation) {
      const variationRect = variation.getBoundingClientRect();
      const barX = variationRect.left - bounds.left, barY = variationRect.top - bounds.top, barWidth = variationRect.width, barHeight = variationRect.height;
      const up = variation.classList.contains("r-traffic-variation-up");
      const down = variation.classList.contains("r-traffic-variation-down");
      context.fillStyle = up ? "#258e61" : down ? "#cf4f5a" : "#8a96a3";
      context.beginPath(); context.roundRect(barX, barY, barWidth, barHeight, barHeight / 2); context.fill();
      context.fillStyle = "#ffffff"; context.textAlign = "center"; context.fillText(up ? `↑ ${text}` : down ? `↓ ${text}` : text, barX + barWidth / 2, barY + barHeight / 2, barWidth - 2);
    } else if (meta) {
      const ok = meta.classList.contains("r-table-meta-ok"), textWidth = context.measureText(text).width, markerX = x + w / 2 - textWidth / 2 - 7;
      context.fillStyle = ok ? "#d9f3e8" : "#fde4e7"; context.beginPath(); context.arc(markerX + 4, y + h / 2, 4, 0, Math.PI * 2); context.fill();
      context.fillStyle = ok ? "#14734f" : "#c23d4b"; context.textAlign = "center"; context.fillText(ok ? "↑" : "↓", markerX + 4, y + h / 2, 8);
      context.fillStyle = css.color || "#2e3d50"; context.textAlign = "left"; context.fillText(text, markerX + 10, y + h / 2, w - 12);
    } else context.fillText(text, horizontal, y + h / 2, w - 4);
    context.restore();
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!(blob && navigator.clipboard && window.ClipboardItem)) throw new Error("Portapapeles no disponible");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
