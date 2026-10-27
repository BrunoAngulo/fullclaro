"use client";

import { useEffect, useRef, useState } from "react";
import { FileDown, Loader2, Pause, Play } from "lucide-react";

type ReportResult = { reportId: string; tipo?: string; columns: string[]; rows: Record<string, unknown>[]; total: number; rango?: { from: string; to: string }; actualizadoEn?: string; lote?: { LoteId?: number; Insertadas?: number; Actualizadas?: number; SinCambios?: number } | null; error?: string };

export function TrReportDownload({ cookie }: { cookie: string }) {
  const [reportCookie, setReportCookie] = useState("");
  const [csrf, setCsrf] = useState("");
  const [payload, setPayload] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [guardar, setGuardar] = useState(false);
  const active = useRef(false);
  const lastSave = useRef(0);

  async function query() {
    if (active.current) return;
    active.current = true; setBusy(true); setError("");
    try {
      const requestCookie = reportCookie || cookie;
      const requestCsrf = csrf;
      const requestPayload = payload;
      if (!requestCookie.includes("=") || !requestCsrf || !requestPayload) throw new Error("Pega una cookie AICC válida y el paquete del reporte.");
      const guardarAhora = guardar && Date.now() - lastSave.current >= 5 * 60_000;
      const response = await fetch("/api/tr/reporte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cookie: requestCookie, csrf: requestCsrf, payload: requestPayload, guardar: guardarAhora }) });
      const data = await response.json() as ReportResult;
      if (!response.ok) throw new Error(data.error || "No se pudo consultar el reporte.");
      if (!data.rows.length) throw new Error("AICC respondió, pero no devolvió filas para esos parámetros.");
      if (data.lote) lastSave.current = Date.now();
      setResult(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo consultar el reporte."); }
    finally { active.current = false; setBusy(false); }
  }

  useEffect(() => { if (!running) return; void query(); const interval = window.setInterval(() => void query(), 10_000); return () => window.clearInterval(interval); }, [running, cookie, reportCookie, csrf, payload, guardar]);

  return <section className="tr-report-tool">
    <div className="tr-card-head"><div><span>LECTURA DE REPORTE</span><h2>Datos de AICC en vivo</h2></div><FileDown size={18}/></div>
    <p>Consulta de solo lectura. El rango se actualiza desde <b>hoy 00:00:00</b> hasta la hora actual de Lima. Nada queda guardado.</p>
    <div className="tr-report-form">
      <label><span>Cookie completa de AICC</span><textarea value={reportCookie} onChange={(event) => setReportCookie(event.target.value)} placeholder="cookie: locale_cookie=…; JSESSIONID=…" autoComplete="off" spellCheck={false}/></label>
      <label><span>CSRF token</span><input type="password" value={csrf} onChange={(event) => setCsrf(event.target.value)} placeholder="csrfwebtoken" autoComplete="off" /></label>
      <label className="tr-report-payload"><span>Payload del reporte</span><textarea value={payload} onChange={(event) => setPayload(event.target.value)} placeholder={'Pega todo el Form Data: reportId, parameterJson y subjectJson.\n\nreportId\n60e…\nparameterJson\n[…]\nsubjectJson\n{…}'} spellCheck={false}/><small>Debe incluir: <b>reportId</b>, <b>parameterJson</b> y <b>subjectJson</b>.</small></label>
      <label className="tr-report-save"><input type="checkbox" checked={guardar} onChange={(event) => setGuardar(event.target.checked)}/><span>Guardar en GTR_FullClaro cada 5 minutos</span></label>
      <button className="tr-connect-btn" disabled={busy || !reportCookie.trim() || !csrf.trim() || !payload.trim()} onClick={() => setRunning((value) => !value)}>{busy ? <Loader2 size={16} className="tr-spin"/> : running ? <Pause size={16}/> : <Play size={16}/>} {running ? "Detener lectura" : "Iniciar lectura cada 10 s"}</button>
    </div>
    {error && <div className="tr-report-error">{error}</div>}
    {result && <><div className="tr-report-result"><span><b>{result.total.toLocaleString("es-PE")}</b> filas recibidas · {result.rango?.from} → {result.rango?.to}{result.lote ? ` · Lote ${result.lote.LoteId}: +${result.lote.Insertadas ?? 0} nuevas, ${result.lote.Actualizadas ?? 0} actualizadas` : ""}</span><small>Actualizado {result.actualizadoEn ? new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(result.actualizadoEn)) : "—"}</small></div><div className="tr-report-table"><table><thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{result.rows.slice(0, 30).map((row, index) => <tr key={index}>{result.columns.map((column) => <td key={column}>{String(row[column] ?? "")}</td>)}</tr>)}</tbody></table>{result.rows.length > 30 && <p>Mostrando las primeras 30 filas de {result.total.toLocaleString("es-PE")}.</p>}</div></>}
  </section>;
}
