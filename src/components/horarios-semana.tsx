"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowDown, ArrowUp, CalendarDays, Check, CircleAlert, Clock3, Download,
  FileSpreadsheet, Loader2, Pencil, RotateCcw, Search, Upload, Users, X } from "lucide-react";
import { asChange, dateKey, normalizeDay, WEEK_DAYS, type Advisor, type AdvisorChange, type PlanningRow, type WeekPlan } from "@/lib/planning-types";
import { breakChoices } from "@/lib/planning-breaks";

const show = (v: unknown) => v === null || v === undefined ? "—" : String(v);
const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function HorariosSemana({ initialLunes }: { initialLunes: string }) {
  const [lunes, setLunes] = useState(initialLunes);
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [basePlan, setBasePlan] = useState<WeekPlan | null>(null);
  const [changes, setChanges] = useState<Record<string, AdvisorChange>>({});
  const [editing, setEditing] = useState<Advisor | null>(null);
  const [draft, setDraft] = useState<AdvisorChange | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("ACTIVO");
  const [modalidad, setModalidad] = useState("");
  const [selectedKey, setSelectedKey] = useState<{ fecha: string; tramo: string } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [onlyBreaks, setOnlyBreaks] = useState(false);
  const advisorsRef = useRef<HTMLElement>(null);
  const [importing, setImporting] = useState(false);
  const [revision, setRevision] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const pending = useMemo(() => Object.values(draft ? { ...changes, [draft.Usuario]: draft } : changes), [changes, draft]);
  const pendingJson = JSON.stringify(pending);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError("");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/gtr/horarios", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lunes, cambios: JSON.parse(pendingJson) }), signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "No se pudo calcular la semana.");
        if (!controller.signal.aborted) {
          setPlan(result);
          if (JSON.parse(pendingJson).length === 0) setBasePlan(result);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "No se pudo calcular la semana.");
      } finally { if (!controller.signal.aborted) setBusy(false); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [lunes, pendingJson, revision]);

  const current = plan?.lunes === lunes ? plan : null;
  const rows = current?.horarios ?? [];
  const selected = current?.cobertura.find((r) => dateKey(r.Fecha) === selectedKey?.fecha && r.Tramo === selectedKey.tramo) ?? null;
  const breakUsers = useMemo(() => new Set((current?.pausas ?? [])
    .filter((r) => dateKey(r.Fecha) === selectedKey?.fecha && r.Tramo === selectedKey.tramo)
    .map((r) => String(r.Usuario))), [current, selectedKey]);
  const advisors = useMemo(() => rows.filter((a) => (!stateFilter || a.Estado === stateFilter) && (!modalidad || a.Modalidad === modalidad)
    && (!selected || !onlyBreaks || breakUsers.has(a.Usuario))
    && normalizeDay(`${a.Agente} ${a.Usuario} ${a.DNI ?? ""}`).includes(normalizeDay(search)))
    .sort((a, b) => Number(breakUsers.has(b.Usuario)) - Number(breakUsers.has(a.Usuario))), [rows, search, stateFilter, modalidad, selected, onlyBreaks, breakUsers]);
  const negative = current?.cobertura.filter((r) => r.Variacion !== null && Number(r.Variacion) < 0).length ?? 0;
  const missing = current?.cobertura.filter((r) => r.Requeridos === null).length ?? 0;
  const active = rows.filter((a) => a.Estado === "ACTIVO").length;
  const minimum = current?.cobertura.filter((r) => r.Variacion !== null).map((r) => Number(r.Variacion)) ?? [];
  const baseCoverage = useMemo(() => new Map(basePlan?.lunes === lunes ? basePlan.cobertura.map((r) => [`${dateKey(r.Fecha)}|${r.Tramo}`, r.Variacion]) : []), [basePlan, lunes]);
  const differences = current?.cobertura.reduce<{ up: number; down: number }>((counts, row) => {
    const base = baseCoverage.get(`${dateKey(row.Fecha)}|${row.Tramo}`);
    if (base !== null && base !== undefined && row.Variacion !== null) {
      if (Number(row.Variacion) > Number(base)) counts.up++;
      if (Number(row.Variacion) < Number(base)) counts.down++;
    }
    return counts;
  }, { up: 0, down: 0 }) ?? { up: 0, down: 0 };
  const modified = pending.length;
  const calculating = busy || (Boolean(draft) && !current);
  const exportPlan = async () => {
    if (!current || busy || error) return;
    setExporting(true);
    try { const { downloadPlanning } = await import("@/lib/planning-export"); downloadPlanning(current); }
    catch { setNotice("No se pudo descargar el Excel. Inténtalo nuevamente."); }
    finally { setExporting(false); }
  };
  function changeWeek(value: string) {
    if (!value) return;
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    setLunes(date.toISOString().slice(0, 10)); setSelectedKey(null); setDetailOpen(false);
  }
  function openAdvisor(a: Advisor) { setEditing(a); setDraft(asChange(a)); }
  function closeEditor() { setEditing(null); setDraft(null); }
  function updateInline(advisor: Advisor, patch: Partial<AdvisorChange>) {
    setChanges((previous) => ({ ...previous, [advisor.Usuario]: { ...(previous[advisor.Usuario] ?? asChange(advisor)), ...patch } }));
  }
  function selectSlot(row: PlanningRow) {
    setSelectedKey({ fecha: dateKey(row.Fecha), tramo: String(row.Tramo) });
    setDetailOpen(false); setSearch(""); setStateFilter("ACTIVO"); setModalidad("");
    advisorsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function clearSlot() { setSelectedKey(null); setOnlyBreaks(false); setDetailOpen(false); }

  return <main className="report-app planner-app"><div className="p-shell">
    <header className="p-header"><a href="/" className="p-back"><ArrowLeft size={16}/> Indicadores</a><span className="p-brand">FULL CLARO <i/> Operaciones</span><a href="/supervisores" className="p-back"><Users size={14}/> Supervisores</a><span className="p-local"><i/> SQL Server local</span></header>
    <div className="p-titlebar"><div><span className="p-eyebrow">TU EQUIPO, TU SEMANA</span><h1>Planifica con cobertura a la vista<span>.</span></h1><p>Ajusta los horarios de tu equipo y revisa el efecto en cada media hora.</p></div>
      <div className="p-top-actions"><button className="p-btn" onClick={() => setImporting(true)}><Upload size={15}/> Subir dotación</button><button className="p-btn p-btn-primary" disabled={!current || busy || !!error || exporting} onClick={exportPlan}>{exporting ? <Loader2 size={15} className="p-spin"/> : <Download size={15}/>} Descargar Dotación actualizada</button></div></div>
    <div className="p-toolbar"><label className="p-week"><CalendarDays size={16}/><span>Semana del</span><input aria-label="Semana de planificación" type="date" value={lunes} onChange={(e) => changeWeek(e.target.value)}/><span>al {current?.resumen[6] ? shortDate(dateKey(current.resumen[6].Fecha)) : "domingo"}</span></label>
      <div className="p-session"><span className={modified ? "p-tag p-tag-blue" : "p-tag"}>{modified ? `${modified} asesor${modified === 1 ? "" : "es"} en propuesta` : "Dotación vigente"}</span><button className="p-reset" disabled={!modified || !!editing} onClick={() => { setChanges({}); setNotice(""); }}><RotateCcw size={13}/> Restablecer</button></div></div>
    {notice && <div className="p-notice" role="status">{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice("")}><X size={14}/></button></div>}
    {error && <div className="p-error" role="alert"><CircleAlert size={17}/><div><strong>No se aplicó el último cambio</strong><p>{error}</p><small>La matriz conserva el último cálculo válido.</small></div></div>}
    <section className="p-stats"><Stat icon={<Users size={17}/>} label="Asesores activos" value={current ? String(active) : "—"} note="según la propuesta"/>
      <Stat icon={<CalendarDays size={17}/>} label="Semana evaluada" value="7 días" note="48 tramos por día"/>
      <Stat icon={<CircleAlert size={17}/>} label="Tramos con faltante" value={current ? String(negative) : "—"} note="de 336 tramos semanales" danger={negative > 0}/>
      <Stat icon={<Clock3 size={17}/>} label="Variación mínima" value={minimum.length ? String(Math.min(...minimum)) : "—"} note={missing ? `${missing} tramos sin dimensión` : "disponibles − requeridos"} danger={minimum.length > 0 && Math.min(...minimum) < 0}/></section>

    <div className="p-workspace"><section ref={advisorsRef} className="p-advisors p-card"><div className="p-section-heading"><div><h2>Asesores y horarios <span>{advisors.length}</span></h2><p>Cambia el DS y el break aquí; la variación se actualiza sola.</p></div><span className="p-mini-note"><Pencil size={12}/> Editar turno</span></div>
      {selected && <div className="p-slot-banner" role="status" aria-busy={busy}>
        <div className="p-slot-title"><Clock3 size={16}/><div><strong>{selected.Dia} {shortDate(dateKey(selected.Fecha))} · {selected.Tramo}</strong><span>{busy ? "Recalculando asesores en break…" : `${breakUsers.size} en break · resaltados y primero en la lista`}</span></div><button type="button" aria-label="Quitar tramo seleccionado" onClick={clearSlot}><X size={15}/></button></div>
        <div className="p-slot-actions"><label><input type="checkbox" checked={onlyBreaks} onChange={(e) => setOnlyBreaks(e.target.checked)}/> Solo en break</label><span>Variación: <b>{show(selected.Variacion)}</b></span><button type="button" onClick={() => setDetailOpen(true)}>Ver detalle</button></div>
        {!busy && breakUsers.size === 0 && <p>Nadie está en break en este tramo. Revisa los turnos o los descansos si falta cobertura.</p>}
      </div>}
      <div className="p-filters"><label className="p-search"><Search size={15}/><input aria-label="Buscar asesor, DNI o usuario" placeholder="Buscar nombre, DNI o usuario…" value={search} onChange={(e) => setSearch(e.target.value)}/></label>
        <select aria-label="Filtrar estado" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}><option value="">Todos los estados</option>{[...new Set(["ACTIVO", ...rows.map((a) => a.Estado)])].sort().map((s) => <option key={s}>{s}</option>)}</select>
        <select aria-label="Filtrar modalidad" value={modalidad} onChange={(e) => setModalidad(e.target.value)}><option value="">Toda modalidad</option>{[...new Set(rows.map((a) => a.Modalidad).filter(Boolean))].map((m) => <option key={m} value={String(m)}>{m}</option>)}</select></div>
      <div className="p-advisor-table"><table><thead><tr><th>Asesor / usuario</th><th>Estado</th><th>Horario</th><th>DS</th><th>Break</th><th><span className="p-sr">Acciones</span></th></tr></thead><tbody>{advisors.map((a) => <tr key={a.Usuario} className={`${a.Modificado ? "p-row-modified " : ""}${breakUsers.has(a.Usuario) ? "p-row-on-break" : ""}`}>
        <td><span className="p-agent-name">{a.Agente}</span><span className="p-agent-sub">{a.Usuario} <i/> {a.TipoDocumento || "Doc."} {a.DNI || "—"}{a.Modificado && <b>EDITADO</b>}{breakUsers.has(a.Usuario) && <b className="p-break-badge">EN BREAK</b>}</span></td>
        <td><span className={`p-state ${a.Estado === "ACTIVO" ? "p-state-active" : ""}`}>{a.Estado}</span><small className="p-mode">{a.Modalidad}</small></td>
        <td className="p-time">{a.Horario}<small className="p-mode">{a.EsMadrugada ? "Madrugada" : a.EsFT ? "Full time" : "Part time"}</small></td><td><select className="p-inline-select p-ds-select" aria-label={`DS de ${a.Agente}`} value={normalizeDay(changes[a.Usuario]?.DS ?? a.DS)} onChange={(e) => updateInline(a, { DS: e.target.value })}>{WEEK_DAYS.map((day) => <option key={day} value={normalizeDay(day)}>{day.charAt(0) + day.slice(1).toLowerCase()}</option>)}</select></td>
        <td className="p-time">{a.EsFT && !a.EsMadrugada ? <BreakDropdown advisor={a} change={changes[a.Usuario] ?? asChange(a)} inline onChange={(start, end) => updateInline(a, { InicioBreak: start, FinBreak: end })}/> : <span className="p-muted">Sin break</span>}</td><td><button className="p-edit" aria-label={`Editar ${a.Agente}`} onClick={() => openAdvisor({ ...a, ...(changes[a.Usuario] ?? {}) })}><Pencil size={14}/></button></td>
      </tr>)}</tbody></table>{!current && <div className="p-empty"><Loader2 className="p-spin" size={22}/> Consultando dotación y dimensión…</div>}{current && !advisors.length && <div className="p-empty">No hay asesores con estos filtros.</div>}</div>
      <footer className="p-advisor-footer"><FileSpreadsheet size={14}/><span>Descarga la Dotación actualizada: la hoja AGENTES incluye tus cambios y podrás subirla como nuevo Excel maestro.</span></footer>
    </section>

    <aside className="p-coverage p-card"><div className="p-section-heading"><div><span className="p-eyebrow">COBERTURA EN VIVO</span><h2>Variación semanal</h2><p>Disponibles − dimensionados</p></div><span role="status" className={`p-calc-status ${calculating ? "p-is-loading" : error ? "p-is-error" : ""}`}>{calculating ? <Loader2 size={12} className="p-spin"/> : error ? <CircleAlert size={12}/> : <Check size={12}/>} {calculating ? "Calculando" : error ? "Revisar" : "Actualizado"}</span></div>
      <div className="p-legend"><span><i className="p-dot-red"/> Falta</span><span><i className="p-dot-neutral"/> Justo</span><span><i className="p-dot-green"/> Cubre</span><span className="p-legend-help">Pulsa una celda para ver el detalle</span></div>
      {modified > 0 && <div className="p-delta-summary"><span><ArrowUp size={11}/>{differences.up} tramos mejoran</span><span><ArrowDown size={11}/>{differences.down} empeoran</span><small>vs. dotación cargada</small></div>}
      <div className={`p-matrix-wrap ${busy || error ? "p-matrix-pending" : ""}`} aria-busy={busy}><VariationMatrix plan={current} baseline={baseCoverage} selectedKey={selectedKey} onSelect={selectSlot}/></div>
      <div className="p-rest-summary" aria-label="Asesores en descanso por día" aria-busy={busy}>
        <div className="p-rest-heading"><CalendarDays size={13}/><span>En descanso semanal</span><small>Asesores activos · según la propuesta</small></div>
        <div className={`p-rest-days ${busy || error ? "p-matrix-pending" : ""}`}>{WEEK_DAYS.map((day, index) => <div key={day}>
          <abbr title={day}>{day.slice(0, 3)}</abbr><strong aria-label={`${day}: ${show(current?.resumen[index]?.EnDescansoSemanal)} asesores en descanso`}>{show(current?.resumen[index]?.EnDescansoSemanal)}</strong>
        </div>)}</div>
      </div>
      <div className="p-coverage-footer"><span>{missing ? `${missing} tramos sin dimensión` : "Cálculo de SQL · personas enteras"}</span><strong>{missing ? "Dimensionamiento incompleto" : negative ? `${negative} tramos por cubrir` : current ? "Todos los tramos cubiertos" : "Cargando…"}</strong></div>
    </aside></div>

    {editing && draft && <Modal title="Editar planificación" className="p-edit-modal" onClose={closeEditor}>
      <div className="p-modal-agent"><span className="p-avatar">{editing.Agente.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("")}</span><div><strong>{editing.Agente}</strong><small>{editing.Usuario} · {editing.TipoDocumento} {editing.DNI}</small></div></div>
      <p className="p-modal-description">Prueba cambios para toda la semana. La variación se actualiza a la derecha.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (!busy && !error) { setChanges((c) => ({ ...c, [draft.Usuario]: draft })); closeEditor(); } }}>
        <div className="p-form-grid"><label>Estado<select value={draft.Estado} onChange={(e) => setDraft({ ...draft, Estado: e.target.value })}>{[...new Set([draft.Estado, ...rows.map((a) => a.Estado), "ACTIVO", "BAJA", "INACTIVO", "VACACIONES", "LICENCIA"])].map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Descanso semanal<select value={normalizeDay(draft.DS)} onChange={(e) => setDraft({ ...draft, DS: e.target.value })}>{WEEK_DAYS.map((s) => <option key={s} value={normalizeDay(s)}>{s}</option>)}</select></label>
          <label>Entrada<input type="time" step={1800} required value={draft.Entrada} onChange={(e) => setDraft({ ...draft, Entrada: e.target.value })}/></label>
          <label>Salida<input type="time" step={1800} required value={draft.Salida} onChange={(e) => setDraft({ ...draft, Salida: e.target.value })}/></label>
        </div>
        {(!editing.EsFT || (draft.Entrada && draft.Entrada < "06:00")) ? <div className="p-break-rule"><Clock3 size={16}/>{!editing.EsFT ? "Part-time: sin break." : "Madrugada: sin break."}</div> : <><div className="p-form-divider">BREAK REGULAR · 60 MINUTOS</div><label className="p-break-label">Selecciona una franja de una hora<BreakDropdown advisor={editing} change={draft} onChange={(start, end) => setDraft({ ...draft, InicioBreak: start, FinBreak: end })}/></label><div className="p-break-rule"><Clock3 size={16}/><span>Inicios cada 30 min. Dentro del turno, terminando al menos 2 h antes de la salida.</span></div></>}
        {error && <p className="p-form-error" role="alert">{error}</p>}
        <div className="p-modal-actions"><button type="button" className="p-btn" onClick={closeEditor}>Cancelar</button><button className="p-btn p-btn-primary" disabled={busy || !!error}>{busy ? <Loader2 size={14} className="p-spin"/> : <Check size={14}/>} Aplicar a propuesta</button></div>
      </form>
    </Modal>}

    {selected && detailOpen && <Modal title={`Cobertura · ${selected.Dia} ${selected.Tramo}`} onClose={() => setDetailOpen(false)}><p className="p-modal-description">{dateKey(selected.Fecha)} · intervalo de 30 minutos</p><div className="p-cell-detail">{[["Dimensionados", selected.Requeridos], ["Programados", selected.Programados], ["En break", selected.EnBreak], ["Disponibles", selected.Disponibles]].map(([label, v]) => <div key={String(label)}><span>{label}</span><strong>{show(v)}</strong></div>)}</div><div className={`p-cell-result ${selected.Requeridos === null ? "p-cell-result-unknown" : Number(selected.Variacion) < 0 ? "p-cell-result-bad" : ""}`}><span>Variación</span><strong>{show(selected.Variacion)}</strong><small>{selected.Requeridos === null ? "Falta dimensionamiento" : Number(selected.Variacion) < 0 ? `Faltan ${selected.RefuerzoRequerido} asesores` : "Tramo cubierto"}</small></div></Modal>}
    {importing && <ImportModal lunes={lunes} onClose={() => setImporting(false)} onImported={(message) => { setChanges({}); setRevision((n) => n + 1); setNotice(message); setImporting(false); }}/>} 
  </div></main>;
}

function BreakDropdown({ advisor, change, onChange, inline = false }: { advisor: Advisor; change: AdvisorChange; onChange: (start: string, end: string) => void; inline?: boolean }) {
  const choices = breakChoices(change.Entrada, change.Salida);
  const selected = choices.some((option) => option.start === change.InicioBreak && option.end === change.FinBreak);
  return <select className={inline ? "p-inline-select p-break-select" : "p-break-dropdown"} aria-label={`Break de ${advisor.Agente}`} value={change.InicioBreak ?? ""} onChange={(e) => {
    const choice = choices.find((option) => option.start === e.target.value);
    if (choice) onChange(choice.start, choice.end);
  }}>
    {!selected && <option value={change.InicioBreak ?? ""} disabled>{change.InicioBreak ? `${change.InicioBreak} - ${change.FinBreak ?? "…"} (revisar)` : choices.length ? "Seleccionar break" : "Sin ventana válida"}</option>}
    {choices.map((option) => <option key={option.start} value={option.start}>{option.label}</option>)}
  </select>;
}

function Stat({ icon, label, value, note, danger }: { icon: ReactNode; label: string; value: string; note: string; danger?: boolean }) {
  return <article className={`p-stat ${danger ? "p-stat-danger" : ""}`}><span className="p-stat-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>;
}

function VariationMatrix({ plan, baseline, selectedKey, onSelect }: { plan: WeekPlan | null; baseline: Map<string, PlanningRow[string]>; selectedKey: { fecha: string; tramo: string } | null; onSelect: (row: PlanningRow) => void }) {
  const dates = plan?.resumen.map((r) => dateKey(r.Fecha)) ?? [];
  const map = new Map(plan?.cobertura.map((r) => [`${dateKey(r.Fecha)}|${r.Tramo}`, r]) ?? []);
  const times = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
  return <table className="p-matrix"><caption className="p-sr">Variación semanal por intervalos de media hora</caption><thead><tr><th scope="col">Hora</th>{WEEK_DAYS.map((day, i) => <th scope="col" key={day}><abbr title={day}>{day.slice(0, 3)}</abbr><small>{dates[i] ? shortDate(dates[i]) : "—"}</small></th>)}</tr></thead><tbody>{times.map((time) => <tr key={time} className={time.endsWith(":00") ? "p-hour-start" : ""}><th scope="row">{time}</th>{WEEK_DAYS.map((day, i) => {
    const row = map.get(`${dates[i]}|${time}`); const v = row?.Variacion;
    const base = baseline.get(`${dates[i]}|${time}`);
    const changed = base !== undefined && base !== null && v !== undefined && v !== null && base !== v;
    const cls = v === null || v === undefined ? "p-missing" : Number(v) < 0 ? "p-deficit" : Number(v) === 0 ? "p-exact" : "p-surplus";
    return <td key={day}><button disabled={!row} aria-pressed={selectedKey?.fecha === dates[i] && selectedKey?.tramo === time} className={`${cls}${changed ? " p-value-changed" : ""}${selectedKey?.fecha === dates[i] && selectedKey?.tramo === time ? " p-slot-selected" : ""}`} onClick={() => row && onSelect(row)} aria-label={`${day} ${time}: variación ${show(v)}`} title={`${day} ${time} · RQ ${show(row?.Requeridos)} · disponibles ${show(row?.Disponibles)}${changed ? ` · Antes: ${base}` : ""}`}>{show(v)}</button></td>;
  })}</tr>)}</tbody></table>;
}

function Modal({ title, children, onClose, className = "" }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = `modal-${title.replace(/[^a-zA-Z0-9]/g, "")}`;
  useEffect(() => { const node = ref.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={ref} className={`p-modal ${className}`} aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onClose(); }}><div className="p-modal-heading"><h2 id={titleId}>{title}</h2><button type="button" aria-label="Cerrar modal" onClick={onClose}><X size={18}/></button></div>{children}</dialog>;
}

function ImportModal({ lunes, onClose, onImported }: { lunes: string; onClose: () => void; onImported: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [progress, setProgress] = useState(0); const [stage, setStage] = useState("");
  async function upload() {
    if (!file) return;
    setBusy(true); setError(""); setProgress(0); setStage("Preparando dotación…");
    try {
      const form = new FormData(); form.set("archivo", file); form.set("tipoEsperado", "dotacion"); form.set("fechaVigencia", lunes);
      const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const request = new XMLHttpRequest(); request.open("POST", "/api/gtr/importar"); request.responseType = "json";
        request.upload.onprogress = (event) => { if (event.lengthComputable) { setProgress(Math.max(1, Math.round((event.loaded / event.total) * 100))); setStage("Subiendo archivo de dotación…"); } };
        request.upload.onloadend = () => { setProgress(100); setStage("Archivo recibido. Actualizando dotación vigente…"); };
        request.onerror = () => reject(new Error("No se pudo conectar para actualizar la dotación."));
        request.onload = () => {
          const payload = request.response ?? (() => { try { return JSON.parse(request.responseText || "{}"); } catch { return {}; } })();
          if (request.status >= 200 && request.status < 300) resolve(payload as Record<string, unknown>);
          else reject(new Error(String((payload as { error?: unknown }).error ?? "No se pudo cargar la dotación.")));
        };
        request.send(form);
      });
      onImported(`Dotación cargada: ${result.Actualizadas ?? 0} actualizados, ${result.Insertadas ?? 0} nuevos, ${result.SinCambios ?? 0} sin cambios. Conflictos: ${result.Conflictos ?? 0}; rechazados: ${result.Rechazadas ?? 0}.`);
      setProgress(100); setStage("Dotación vigente actualizada.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar la dotación."); setStage("No se pudo actualizar la dotación."); }
    finally { setBusy(false); }
  }
  return <Modal title="Actualizar dotación" onClose={() => { if (!busy) onClose(); }}><p className="p-modal-description">Carga tu Excel maestro. Actualiza estados, horarios, descansos y breaks por usuario.</p><label className="p-upload"><FileSpreadsheet size={32}/><strong>{file?.name || "Selecciona Dota - Full Claro.xlsx"}</strong><span>Hoja AGENTES · .xlsx o .xls</span><input type="file" accept=".xlsx,.xls" aria-label="Archivo de dotación" disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setProgress(0); setStage(""); setError(""); }}/></label><div className="p-break-rule"><CalendarDays size={16}/>Vigencia de la carga: {lunes}. Actualiza la dotación vigente y reemplaza la propuesta en pantalla.</div>{(busy || stage) && <div className={`p-upload-progress ${busy && progress === 100 ? "p-upload-progress-processing" : ""}`} role="status" aria-live="polite"><div><span>{stage}</span><strong>{progress}%</strong></div><i><b style={{ width: `${progress}%` }}/></i></div>}{error && <p className="p-form-error" role="alert">{error}</p>}<div className="p-modal-actions"><button className="p-btn" disabled={busy} onClick={onClose}>Cancelar</button><button className="p-btn p-btn-primary" disabled={!file || busy} onClick={upload}>{busy ? <Loader2 size={15} className="p-spin"/> : <Upload size={15}/>} {busy ? (progress < 100 ? `Subiendo ${progress}%` : "Actualizando…") : "Importar y actualizar"}</button></div></Modal>;
}
