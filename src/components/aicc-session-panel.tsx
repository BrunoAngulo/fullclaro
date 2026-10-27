"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardPaste, Loader2, Radio, XCircle } from "lucide-react";

const SESSION_KEY = "gtr-aicc-cookie";

function cookieHeader(value: string) {
  try {
    const packageValue = JSON.parse(value) as { version?: unknown; cookie?: unknown };
    if (packageValue.version === "GTR_AICC_LIVE_V1" && typeof packageValue.cookie === "string") return packageValue.cookie.trim();
  } catch { /* Es una cookie normal, no un paquete. */ }
  if (!value.includes("\t")) return value.trim();
  const pairs = value.split(/\r?\n/).map((line) => line.split("\t")).flatMap((cells) => {
    const [name, content] = cells.map((cell) => cell.trim());
    return name && content !== undefined && /^[A-Za-z0-9_-]+$/.test(name) ? [`${name}=${content}`] : [];
  });
  return pairs.join("; ");
}

export function AiccSessionPanel() {
  const [cookie, setCookie] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");

  async function paste() {
    try { const converted=cookieHeader(await navigator.clipboard.readText()); setCookie(converted); setStatus("idle"); setMessage(converted ? "Cookie lista para validar." : "No se encontraron cookies en el portapapeles."); }
    catch { setStatus("error"); setMessage("Permite el acceso al portapapeles o pega la cookie manualmente."); }
  }
  async function validateAndOpen() {
    const current=cookieHeader(cookie);
    if (!current.includes("=")) { setStatus("error"); setMessage("Pega la cookie completa de AICC."); return; }
    setStatus("checking"); setMessage("");
    try {
      const response = await fetch("/api/tr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cookie: current }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "AICC no aceptó la sesión.");
      sessionStorage.setItem(SESSION_KEY, current);
      setStatus("ready"); setMessage("Sesión validada. Abriendo Indicadores TR…");
      window.setTimeout(() => { window.location.assign("/tr"); }, 450);
    } catch (reason) { setStatus("error"); setMessage(reason instanceof Error ? reason.message : "No se pudo validar la sesión."); }
  }
  function clear() { sessionStorage.removeItem(SESSION_KEY); setCookie(""); setStatus("idle"); setMessage("Sesión eliminada de esta pestaña."); }
  return <section className="r-aicc-session">
    <div className="r-aicc-session-title"><Radio size={16}/><div><strong>Sesión AICC</strong><span>Solo vive mientras esta pestaña esté abierta.</span></div></div>
    <a className="r-aicc-extension" href="/gtr-aicc-cookie-helper.zip" download>Descargar extensión para copiar cookie AICC</a><p className="r-aicc-extension-help">En Edge/Chrome: <b>Extensiones → Administrar extensiones → Modo desarrollador → Cargar descomprimida</b>. Descomprime el ZIP y selecciona esa carpeta.</p>
    <label>Cookie completa de AICC<textarea value={cookie} onChange={(event) => { setCookie(event.target.value); setStatus("idle"); }} placeholder="Pega la cabecera Cookie o el listado tabulado Nombre / Valor copiado desde tu extensión…" autoComplete="off" spellCheck={false}/><small>Puedes copiar toda la tabla de cookies: la web tomará automáticamente Nombre y Valor.</small></label>
    <div className="r-aicc-session-actions"><button type="button" onClick={() => void paste()}><ClipboardPaste size={14}/> Pegar desde portapapeles</button><button type="button" className="r-aicc-session-primary" disabled={status === "checking" || !cookie.trim()} onClick={() => void validateAndOpen()}>{status === "checking" ? <Loader2 size={14} className="r-aicc-spin"/> : <CheckCircle2 size={14}/>} Obtener sesión AICC</button></div>
    {message && <p className={`r-aicc-session-status r-aicc-${status}`}>{status === "error" && <XCircle size={13}/>} {message}</p>}
    <button type="button" className="r-aicc-clear" onClick={clear}>Cerrar sesión AICC de esta pestaña</button>
  </section>;
}
