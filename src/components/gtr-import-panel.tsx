"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";

type ImportResult = { LoteId?: number; Estado?: string; Leidas?: number; Validas?: number; Insertadas?: number; SinCambios?: number; Rechazadas?: number; Tipo?: string; error?: string };

function reportName(tipo?: string) {
  return tipo === "trazabilidad" ? "Trazabilidad" : tipo === "estados" ? "Estados por asesor" : tipo === "dotacion" ? "Dotación" : "reporte";
}

export function GtrImportPanel({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [detectedType, setDetectedType] = useState("");
  const [detectionError, setDetectionError] = useState("");
  async function selectFile(next: File | null) {
    setFile(next); setResult(null); setDetectedType(""); setDetectionError(""); setUploadProgress(0); setUploadStage("");
    if (!next) return;
    try {
      const form = new FormData(); form.set("archivo", next); form.set("soloDetectar", "true");
      const response = await fetch("/api/gtr/importar", { method: "POST", body: form });
      const payload = await response.json() as ImportResult;
      if (!response.ok) throw new Error(payload.error ?? "No se pudo reconocer el archivo.");
      setDetectedType(payload.Tipo ?? "");
    } catch (error) { setDetectionError(error instanceof Error ? error.message : "No se pudo reconocer el archivo."); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setResult({ error: "Selecciona el Excel antes de importar." });
    setLoading(true); setResult(null); setUploadProgress(0); setUploadStage("Preparando archivo…");
    try {
      const form = new FormData(); form.set("archivo", file);
      const payload = await postImport(form, (progress, stage) => { setUploadProgress(progress); setUploadStage(stage); });
      setResult(payload); onImported();
      setUploadProgress(100); setUploadStage("Importación completada.");
    } catch (error) { setResult({ error: error instanceof Error ? error.message : "No se pudo importar el archivo." }); setUploadStage("No se pudo completar la importación."); }
    finally { setLoading(false); }
  }
  return <section className="r-import-panel" aria-label="Importar archivos AICC">
    <div className="r-import-heading"><FileSpreadsheet size={19}/><div><strong>Importar archivo AICC</strong><span>Reconoce Trazabilidad, Estados por asesor o Dotación por sus columnas.</span></div></div>
    <form onSubmit={submit} className="r-import-form">
      <label>Archivo Excel<input type="file" accept=".xls,.xlsx" onChange={(event: ChangeEvent<HTMLInputElement>) => void selectFile(event.target.files?.[0] ?? null)} disabled={loading}/></label>
      <button type="submit" disabled={loading}>{loading ? <><LoaderCircle className="r-import-spin" size={16}/>{uploadProgress < 100 ? `Subiendo ${uploadProgress}%` : "Procesando…"}</> : <><Upload size={16}/> Importar y guardar</>}</button>
    </form>
    {file && <p className="r-selected-file">Archivo: {file.name}</p>}
    {detectedType && <p className="r-detected-file">Archivo de {reportName(detectedType)} reconocido ✓</p>}
    {(loading || uploadStage) && <div className={`r-import-progress ${loading && uploadProgress === 100 ? "r-import-progress-processing" : ""}`} role="status" aria-live="polite"><div className="r-import-progress-label"><span>{uploadStage}</span><strong>{uploadProgress}%</strong></div><div className="r-import-progress-track"><i style={{ width: `${uploadProgress}%` }}/></div></div>}
    {detectionError && <p className="r-import-error">{detectionError}</p>}
    {result && (result.error ? <p className="r-import-error">{result.error}</p> : <p className="r-import-result"><strong>Archivo de {reportName(result.Tipo)} · Lote {result.LoteId} · {result.Estado}</strong> Leídas: {result.Leidas ?? 0} · Válidas: {result.Validas ?? 0} · Insertadas: {result.Insertadas ?? 0} · Sin cambios: {result.SinCambios ?? 0} · Rechazadas: {result.Rechazadas ?? 0}</p>)}
  </section>;
}

function postImport(form: FormData, onProgress: (progress: number, stage: string) => void) {
  return new Promise<ImportResult>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/gtr/importar");
    request.responseType = "json";
    request.upload.onloadstart = () => onProgress(0, "Subiendo archivo…");
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)), "Subiendo archivo…");
    };
    request.upload.onload = () => onProgress(100, "Archivo recibido. Validando y guardando en SQL Server…");
    request.onerror = () => reject(new Error("Se perdió la conexión durante la carga del archivo."));
    request.onload = () => {
      const payload = request.response as ImportResult | null;
      if (!payload) return reject(new Error("La importación no devolvió una respuesta válida."));
      if (request.status < 200 || request.status >= 300) return reject(new Error(payload.error ?? "No se pudo importar el archivo."));
      resolve(payload);
    };
    request.send(form);
  });
}
