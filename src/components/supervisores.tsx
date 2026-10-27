"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Check, ChevronRight, CircleAlert, Clock3, Loader2, Pencil, Plus, RefreshCw, Search, ShieldCheck, Users, X } from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import type { SupervisionData, Supervisor, TeamKpi } from "@/lib/supervision-types";

const amount = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("es-PE", { style: "percent", maximumFractionDigits: 1 });
const n = (v: number | undefined) => v === undefined ? "—" : amount.format(v);
const p = (v: number | null | undefined) => v == null ? "—" : pct.format(v);
const time = (v: number | null | undefined) => {
  if (v == null) return "—";
  const seconds = Math.round(v);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((x) => String(x).padStart(2, "0")).join(":");
};
const day = (v: string | null) => v ? v.slice(0, 10).split("-").reverse().join("/") : "—";
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
type SortKey = "Supervisor" | "Agente" | "Recibidas" | "Atendidas" | "Abandonadas" | "NS" | "NA" | "CAT" | "TMG" | "TNPS" | "Encuestas";

export function Supervisores({ today }: { today: string }) {
  const [fecha, setFecha] = useState(today);
  const [data, setData] = useState<SupervisionData | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [team, setTeam] = useState("__TOTAL__");
  const [tab, setTab] = useState<"resultados" | "asignacion" | "historial">("resultados");
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [destination, setDestination] = useState("");
  const [desde, setDesde] = useState(today);
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: "Agente", descending: false });
  const [editing, setEditing] = useState<Supervisor | null>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [modalError, setModalError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError("");
    fetch(`/api/gtr/supervisores?fecha=${fecha}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); if (!controller.signal.aborted) setData(result); })
      .catch((e) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "No se pudo consultar la supervisión."); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [fecha, revision]);
  const current = data?.fecha === fecha ? data : null;
  const total = current?.resumen.find((r) => r.Nivel === "TOTAL");
  const effectiveTeam = current?.resumen.some((r) => r.SupervisorId === team) ? team : "__TOTAL__";
  const group = current?.resumen.find((r) => r.SupervisorId === effectiveTeam);
  const supervisors = current?.supervisores ?? [];
  const groups = current?.resumen.filter((r) => r.Nivel === "SUPERVISOR") ?? [];
  const rows = useMemo(() => (current?.asesores ?? []).filter((r) => (r.Asesores > 0 || r.Registros > 0)
    && (effectiveTeam === "__TOTAL__" || r.SupervisorId === effectiveTeam) && (!estado || r.Estado === estado)
    && (tab !== "asignacion" || r.Asesores > 0)
    && normalize(`${r.Agente} ${r.AgenteId} ${r.DNI}`).includes(normalize(search)))
    .sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      const comparison = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "es");
      return sort.descending ? -comparison : comparison;
    }), [current, effectiveTeam, estado, search, sort, tab]);
  const states = useMemo(() => [...new Set((current?.asesores ?? []).filter((a) => a.Asesores > 0).map((a) => a.Estado ?? ""))].sort(), [current]);
  const chart = groups.filter((r) => r.Registros > 0).map((r) => ({ supervisor: r.Supervisor.split(" ").slice(0, 2).join(" "), nombre: r.Supervisor, recibidas: r.Recibidas, atendidas: r.Atendidas }));
  const goals = current?.objetivos ?? [];
  const target = (code: string) => {
    const goal = goals.find((g) => g.Codigo === code);
    return goal ? `${goal.Operador} ${code === "TMG" ? time(goal.Objetivo) : p(goal.Objetivo)}` : "Meta sin configurar";
  };
  const fallback = current?.asesores.some((a) => a.Asesores > 0 && a.FuenteAsignacion === "DOTACION_ACTUAL_SIN_HISTORIAL");
  const visibleIds = rows.map((r) => r.AgenteId!).filter(Boolean);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  function sortBy(key: SortKey) { setSort((s) => ({ key, descending: s.key === key ? !s.descending : key !== "Agente" })); }
  function toggle(id: string) { setSelected((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]); }
  function toggleAll() { setSelected((ids) => allSelected ? ids.filter((id) => !visibleIds.includes(id)) : [...new Set([...ids, ...visibleIds])]); }
  async function mutate(body: object) {
    const response = await fetch("/api/gtr/supervisores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo guardar el cambio.");
    return result;
  }
  async function assign() {
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await mutate({ accion: "asignar", agentes: selected, supervisorId: destination, fechaDesde: desde });
      setNotice(`${result.resultado.Asignados} asesores actualizados desde el ${day(desde)}. La asignación quedó guardada en SQL.`);
      setSelected([]); setRevision((v) => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo asignar el equipo."); }
    finally { setSaving(false); }
  }
  function openSupervisor(s: Supervisor | null) {
    setEditing(s); setName(s?.Nombre ?? ""); setActive(s?.Activa ?? true); setModalError(""); dialog.current?.showModal();
  }
  async function saveSupervisor(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setModalError("");
    try {
      await mutate({ accion: "supervisor", supervisorId: editing?.SupervisorId ?? "", nombre: name, activa: active });
      dialog.current?.close(); setNotice(editing ? "Supervisor actualizado en SQL." : "Supervisor registrado en SQL."); setRevision((v) => v + 1);
    } catch (e) { setModalError(e instanceof Error ? e.message : "No se pudo guardar el supervisor."); }
    finally { setSaving(false); }
  }
  const header = (label: string, key: SortKey) => <th scope="col"><button type="button" onClick={() => sortBy(key)} title={`Ordenar por ${label}`}>{label}</button></th>;
  return <main className="supervision-app"><div className="s-shell">
    <header className="s-header"><a href="/" className="s-back"><ArrowLeft size={14} /> Indicadores</a><span className="s-brand">GTR <i /> FULL CLARO</span><nav aria-label="Secciones"><a href="/horarios">Horarios</a><a href="/supervisores" aria-current="page">Supervisores</a></nav><span className="s-local"><i /> SQL Server local</span></header>
    <section className="s-title"><div><span className="s-eyebrow">EQUIPOS & DESEMPEÑO</span><h1>Supervisores<span>.</span></h1><p>Organiza tus equipos y consulta sus resultados del día.</p></div><div className="s-actions"><label className="s-date"><CalendarDays size={15} /><span className="s-sr">Fecha del reporte</span><input aria-label="Fecha del reporte" type="date" value={fecha} onChange={(e) => { if (e.target.value) { setFecha(e.target.value); setSelected([]); } }} /></label><button className="s-button" aria-label="Actualizar resultados" onClick={() => setRevision((v) => v + 1)} disabled={busy}><RefreshCw size={14} className={busy ? "s-spin" : ""} /></button><button className="s-button s-primary" onClick={() => openSupervisor(null)}><Plus size={14} /> Nuevo supervisor</button></div></section>
    {notice && <div className="s-notice" role="status"><Check size={15} />{notice}<button aria-label="Cerrar mensaje" onClick={() => setNotice("")}><X size={14} /></button></div>}
    {error && <div className="s-error" role="alert"><CircleAlert size={15} />{error}<button onClick={() => setRevision((v) => v + 1)}>Reintentar</button></div>}
    <section className="s-team-strip" aria-label="Seleccionar equipo"><button onClick={() => { setTeam("__TOTAL__"); setSelected([]); }} className={team === "__TOTAL__" ? "s-team-active" : ""}><div className="s-avatar s-avatar-all"><Users size={17} /></div><span><strong>Todos los equipos</strong><small>{n(total?.Activos)} activos · {n(total?.Asesores)} en dotación</small></span></button>{groups.map((r, i) => <button key={r.SupervisorId} onClick={() => { setTeam(r.SupervisorId); setSelected([]); }} className={team === r.SupervisorId ? "s-team-active" : ""}><div className={`s-avatar s-tone-${i % 4}`}>{r.Supervisor.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("")}</div><span><strong>{r.Supervisor}</strong><small>{r.Activos} activos · {r.Asesores} en dotación</small></span></button>)}</section>
    <div className="s-team-heading"><div><h2>{group?.Supervisor ?? "Todos los equipos"}</h2><span>{day(fecha)} · {n(group?.ConActividad)} usuarios con llamadas</span></div>{group && supervisors.some((s) => s.SupervisorId === group.SupervisorId) && <button className="s-text-button" onClick={() => openSupervisor(supervisors.find((s) => s.SupervisorId === group.SupervisorId)!)}><Pencil size={12} /> Editar supervisor</button>}</div>
    <section className="s-kpis" aria-label="Indicadores del equipo" aria-busy={busy}>
      <Kpi label="Recibidas" value={n(group?.Recibidas)} detail="Llamadas entrantes" />
      <Kpi label="Atendidas" value={n(group?.Atendidas)} detail={`${n(group?.Abandonadas)} abandonadas · ${p(group?.Abandono)}`} />
      <Kpi label="Nivel de servicio" value={p(group?.NS)} cumple={group?.CumpleNS} detail={target("NS")} />
      <Kpi label="Nivel de atención" value={p(group?.NA)} cumple={group?.CumpleNA} detail={target("NA")} />
      <Kpi label="CAT" value={p(group?.CAT)} cumple={group?.CumpleCAT} detail={target("CAT")} />
      <Kpi label="TMG" value={time(group?.TMG)} cumple={group?.CumpleTMG} detail={target("TMG")} />
      <Kpi label="Transferencia" value={p(group?.Transferencia)} cumple={group?.CumpleTransferencia} detail={target("TRANSFERENCIA")} />
      <Kpi label="TNPS" value={p(group?.TNPS)} cumple={group?.CumpleTNPS} detail={`${target("TNPS")} · ${n(group?.Encuestas)} encuestas`} />
    </section>
    {current && total?.Registros === 0 && <div className="s-info"><Clock3 size={15} />Todavía no hay llamadas cargadas para este día. Puedes organizar los equipos o elegir una fecha con datos.</div>}
    <div className="s-tabs" role="tablist" aria-label="Vista de supervisión">{([['resultados','Desempeño por equipo'],['asignacion','Asignar asesores'],['historial','Historial']] as const).map(([id,label]) => <button key={id} role="tab" aria-selected={tab === id} aria-controls={`s-panel-${id}`} id={`s-tab-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={(e) => { const tabs = ['resultados','asignacion','historial'] as const; if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const next = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : 2)) % 3]; setTab(next); document.getElementById(`s-tab-${next}`)?.focus(); } }}>{label}{id === "asignacion" && <span>{total?.Asesores ?? "—"}</span>}</button>)}<span>{busy && <><Loader2 size={12} className="s-spin" /> Consultando SQL…</>}</span></div>
    <section role="tabpanel" id={`s-panel-${tab}`} aria-labelledby={`s-tab-${tab}`} aria-busy={busy}>
    {tab === "resultados" && <>
      <div className="s-overview"><section className="s-panel"><div className="s-panel-title"><div><h3>Comparativo de supervisores</h3><p>Selecciona un equipo para ver a sus asesores.</p></div><ShieldCheck size={17} /></div><div className="s-table-wrap"><table className="s-comparison"><thead><tr><th scope="col">Supervisor</th><th scope="col">Activos</th><th scope="col">Atend.</th><th scope="col">NS</th><th scope="col">CAT</th><th scope="col">TMG</th><th scope="col">TNPS</th></tr></thead><tbody>{groups.map((r) => <tr key={r.SupervisorId} className={team === r.SupervisorId ? "s-chosen" : ""}><th scope="row"><button onClick={() => { setTeam(r.SupervisorId); setSelected([]); }}>{r.Supervisor}<ChevronRight size={12} /></button></th><td>{r.Activos}</td><td>{r.Atendidas}</td><td><Metric value={p(r.NS)} cumple={r.CumpleNS} /></td><td><Metric value={p(r.CAT)} cumple={r.CumpleCAT} /></td><td><Metric value={time(r.TMG)} cumple={r.CumpleTMG} /></td><td><Metric value={p(r.TNPS)} cumple={r.CumpleTNPS} /></td></tr>)}{!groups.length && <tr><td colSpan={7}>Sin equipos para mostrar.</td></tr>}</tbody></table></div></section><section className="s-panel s-chart"><div className="s-panel-title"><div><h3>Volumen por equipo</h3><p><i className="s-dot s-dot-light" /> Recibidas <i className="s-dot" /> Atendidas</p></div></div>{chart.length ? <BarChart data={chart} xDataKey="supervisor" aspectRatio="2.2 / 1"><Grid horizontal stroke="#e9eff4" /><Bar dataKey="recibidas" fill="#b4d6e3" lineCap="round" /><Bar dataKey="atendidas" fill="#27677f" lineCap="round" /><BarXAxis /><ChartTooltip /></BarChart> : <div className="s-empty">Sin llamadas cargadas para comparar.</div>}</section></div>
      <section className="s-panel"><div className="s-panel-title"><div><h3>Resultados de los asesores <span>{rows.length}</span></h3><p>Indicadores calculados con las llamadas del día seleccionado.</p></div><span className="s-legend"><ArrowUp size={12} /> Meta cumplida <ArrowDown size={12} /> Bajo meta</span></div><Filters search={search} setSearch={setSearch} estado={estado} setEstado={setEstado} states={states} /><div className="s-table-wrap"><table className="s-agents"><thead><tr>{header("Asesor", "Agente")}<th scope="col">Supervisor</th>{header("Rec.", "Recibidas")}{header("Atend.", "Atendidas")}{header("Aband.", "Abandonadas")}{header("NS", "NS")}{header("NA", "NA")}{header("CAT", "CAT")}{header("TMG", "TMG")}<th scope="col">Prom.</th><th scope="col">Neut.</th><th scope="col">Detr.</th>{header("Encuestas", "Encuestas")}{header("TNPS", "TNPS")}</tr></thead><tbody>{rows.map((r) => <tr key={r.AgenteId}><td className="s-person"><strong>{r.Agente}</strong><small>{r.AgenteId} · {r.Estado}</small></td><td className="s-super-name">{r.Supervisor}</td><td>{r.Recibidas}</td><td>{r.Atendidas}</td><td>{r.Abandonadas}</td><td><Metric value={p(r.NS)} cumple={r.CumpleNS} /></td><td><Metric value={p(r.NA)} cumple={r.CumpleNA} /></td><td><Metric value={p(r.CAT)} cumple={r.CumpleCAT} /></td><td><Metric value={time(r.TMG)} cumple={r.CumpleTMG} /></td><td>{r.Promotores}</td><td>{r.Neutros}</td><td>{r.Detractores}</td><td>{r.Encuestas}</td><td><Metric value={p(r.TNPS)} cumple={r.CumpleTNPS} /></td></tr>)}{!rows.length && <tr><td colSpan={14} className="s-empty">No hay asesores con estos filtros.</td></tr>}</tbody></table></div></section>
    </>}
    {tab === "asignacion" && <section className="s-panel"><div className="s-panel-title"><div><h3>Asesores y supervisor asignado</h3><p>Selecciona uno o varios asesores y guarda el equipo al que pertenecen.</p></div><button className="s-text-button" onClick={() => { setTeam("__TOTAL__"); setSearch(""); setEstado(""); }}>Ver toda la dotación</button></div><div className="s-assignment"><span><Users size={16} /><strong>{selected.length}</strong> seleccionados{selected.length > 0 && <button className="s-text-button" onClick={() => setSelected([])}>Limpiar</button>}</span><label>Asignar a<select aria-label="Supervisor de destino" value={destination} onChange={(e) => setDestination(e.target.value)}><option value="">Sin supervisor</option>{supervisors.filter((s) => s.Activa).map((s) => <option key={s.SupervisorId} value={s.SupervisorId}>{s.Nombre}</option>)}</select></label><label>Aplicar desde<input type="date" aria-label="Aplicar asignación desde" value={desde} onChange={(e) => setDesde(e.target.value)} /></label><button className="s-button s-primary" disabled={!selected.length || !desde || saving || busy} onClick={assign}>{saving ? <Loader2 size={14} className="s-spin" /> : <Check size={14} />}Guardar asignación</button></div><Filters search={search} setSearch={setSearch} estado={estado} setEstado={setEstado} states={states} /><div className="s-table-wrap"><table className="s-assignment-table"><thead><tr><th scope="col"><input type="checkbox" aria-label="Seleccionar todos los asesores visibles" checked={allSelected} onChange={toggleAll} disabled={saving || busy} /></th>{header("Asesor", "Agente")}<th scope="col">DNI</th><th scope="col">Usuario</th><th scope="col">Modalidad</th><th scope="col">Estado</th><th scope="col">Supervisor</th><th scope="col">Asignación</th></tr></thead><tbody>{rows.map((r) => <tr key={r.AgenteId} className={selected.includes(r.AgenteId!) ? "s-chosen" : ""}><td><input type="checkbox" aria-label={`Seleccionar a ${r.Agente}`} checked={selected.includes(r.AgenteId!)} disabled={saving || busy} onChange={() => toggle(r.AgenteId!)} /></td><td className="s-person"><strong>{r.Agente}</strong></td><td>{r.DNI ?? "—"}</td><td>{r.AgenteId}</td><td>{r.Modalidad}</td><td><span className={`s-state ${r.Estado === "ACTIVO" ? "s-state-active" : ""}`}>{r.Estado}</span></td><td className="s-super-name">{r.Supervisor}</td><td><span className="s-source">{r.VigenteDesde ? `Desde ${day(r.VigenteDesde)}` : "Dotación actual"}</span></td></tr>)}{!rows.length && <tr><td colSpan={8} className="s-empty">No hay asesores con estos filtros.</td></tr>}</tbody></table></div><div className="s-catalog"><div><h3>Supervisores registrados</h3><p>Puedes editar sus nombres o registrar uno nuevo.</p></div>{supervisors.map((s) => <button key={s.SupervisorId} className="s-super-chip" onClick={() => openSupervisor(s)}><ShieldCheck size={13} /><span>{s.Nombre}<small>{s.Activa ? "Activo" : "Inactivo"}</small></span><Pencil size={12} /></button>)}</div></section>}
    {tab === "historial" && <section className="s-panel"><div className="s-panel-title"><div><h3>Cambios de supervisión</h3><p>Últimas 200 asignaciones guardadas desde la web. Las fechas delimitan a qué equipo se atribuyen los indicadores.</p></div></div><div className="s-table-wrap"><table><thead><tr><th scope="col">Asesor</th><th scope="col">Usuario</th><th scope="col">Supervisor</th><th scope="col">Desde</th><th scope="col">Hasta</th></tr></thead><tbody>{current?.historial.map((r) => <tr key={`${r.AgenteId}-${r.VigenteDesde}`}><td className="s-person">{r.Agente}</td><td>{r.AgenteId}</td><td className="s-super-name">{r.Supervisor}</td><td>{day(r.VigenteDesde)}</td><td>{r.VigenteHasta ? day(r.VigenteHasta) : "Vigente"}</td></tr>)}{!current?.historial.length && <tr><td colSpan={5} className="s-empty">Todavía no se han guardado cambios desde la web.</td></tr>}</tbody></table></div></section>}
    </section>
    <footer className="s-footnote"><ShieldCheck size={14} /><p>Metas de CONTRATO_2026. Los indicadores se calculan en SQL con los componentes del reporte por asesor; los porcentajes del equipo se obtienen de sus totales.{fallback && <span> Para los asesores sin asignación fechada se usa la dotación actual; su supervisor histórico no está confirmado.</span>} Activos refleja el estado actual de la dotación. Una llamada sin asesor queda en “Sin supervisor”.</p></footer>
    <dialog ref={dialog} className="s-dialog" aria-labelledby="s-dialog-title" onCancel={(e) => { if (saving) e.preventDefault(); }}><form onSubmit={saveSupervisor}><div className="s-dialog-heading"><div className="s-avatar s-avatar-all"><ShieldCheck size={19} /></div><button type="button" aria-label="Cerrar supervisor" disabled={saving} onClick={() => dialog.current?.close()}><X size={18} /></button></div><h2 id="s-dialog-title">{editing ? "Editar supervisor" : "Nuevo supervisor"}</h2><p>Registra al responsable y luego asígnale sus asesores.</p><label>Nombre del supervisor<input autoFocus required maxLength={250} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombres y apellidos" /></label>{editing && <label className="s-check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Supervisor activo</label>}{modalError && <div className="s-error" role="alert">{modalError}</div>}<div className="s-dialog-actions"><button className="s-button" type="button" disabled={saving} onClick={() => dialog.current?.close()}>Cancelar</button><button className="s-button s-primary" type="submit" disabled={saving || !name.trim()}>{saving ? <Loader2 size={14} className="s-spin" /> : <Check size={14} />}Guardar supervisor</button></div></form></dialog>
  </div></main>;
}
function Metric({ value, cumple }: { value: ReactNode; cumple: boolean | null | undefined }) {
  return <span className={`s-metric ${cumple == null ? "" : cumple ? "s-good" : "s-bad"}`} title={cumple == null ? "Sin datos o sin meta evaluable" : cumple ? "Meta cumplida" : "Meta no cumplida"}>{cumple != null && (cumple ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}{value}</span>;
}
function Kpi({ label, value, detail, cumple }: { label: string; value: string; detail: string; cumple?: boolean | null }) {
  return <article><div><span>{label}</span>{cumple == null ? <span className="s-kpi-neutral">—</span> : <span className={cumple ? "s-good" : "s-bad"}>{cumple ? <ArrowUp size={14} /> : <ArrowDown size={14} />}</span>}</div><strong>{value}</strong><small>{detail}</small></article>;
}
function Filters({ search, setSearch, estado, setEstado, states }: { search: string; setSearch: (v: string) => void; estado: string; setEstado: (v: string) => void; states: string[] }) {
  return <div className="s-filters"><label className="s-search"><Search size={14} /><input aria-label="Buscar asesor, usuario o DNI" placeholder="Buscar asesor, usuario o DNI…" value={search} onChange={(e) => setSearch(e.target.value)} /></label><select aria-label="Filtrar estado del asesor" value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos los estados</option>{states.map((s) => <option key={s}>{s}</option>)}</select></div>;
}
