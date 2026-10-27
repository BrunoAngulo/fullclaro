import { NextResponse } from "next/server";
import https from "node:https";
import { spawn } from "node:child_process";
import { executeGtrRecordsets } from "@/lib/gtr-sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGIN = "https://10.189.8.188:28090";
const PATH = "/isa/queryTableData.view";

type CapturedPayload = {
  reportId: string;
  parameterJson: string;
  subjectJson: string;
  curPage: string;
  recordperpage: string;
  sortAndFilterJSON: string;
  dataSourceNameForDataGrid: string;
};

function capturedValue(payload: string, label: string) {
  const lines = payload.replace(/\r/g, "").split("\n");
  const key = label.replace(/^\d+\.\s*/, "");
  const index = lines.findIndex((line) => line.trim().toLowerCase() === label.toLowerCase() || line.trim().toLowerCase() === key.toLowerCase());
  if (index >= 0) return (lines[index + 1] ?? "").trim();
  const inline = lines.find((line) => new RegExp(`^\\s*(?:\\d+\\.\\s*)?${key}\\s*[:=]\\s*`, "i").test(line));
  if (inline) return inline.replace(new RegExp(`^\\s*(?:\\d+\\.\\s*)?${key}\\s*[:=]\\s*`, "i"), "").trim();
  try { return new URLSearchParams(payload.trim()).get(key) ?? ""; } catch { return ""; }
}

function headerValue(raw: string, name: string) {
  const expression = new RegExp(`(?:^|\\n)\\s*(?:\\*\\*)?${name}(?:\\*\\*)?\\s*(?::|\\n)\\s*([^\\r\\n]+)`, "i");
  return raw.match(expression)?.[1]?.trim() ?? "";
}

function readPayload(payload: string): CapturedPayload {
  const values = {
    reportId: capturedValue(payload, "1. reportId"),
    parameterJson: capturedValue(payload, "2. parameterJson"),
    subjectJson: capturedValue(payload, "3. subjectJson"),
    curPage: capturedValue(payload, "4. curPage") || "1",
    recordperpage: capturedValue(payload, "5. recordperpage") || "10000",
    sortAndFilterJSON: capturedValue(payload, "6. sortAndFilterJSON") || "{}",
    dataSourceNameForDataGrid: capturedValue(payload, "7. dataSourceNameForDataGrid"),
  };
  if (!values.reportId || !values.parameterJson || !values.subjectJson)
    throw new Error("El payload debe incluir reportId, parameterJson y subjectJson.");
  try { JSON.parse(values.parameterJson); JSON.parse(values.subjectJson); JSON.parse(values.sortAndFilterJSON); }
  catch { throw new Error("El payload contiene JSON inválido."); }
  return values;
}

function limaNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (part: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === part)?.value ?? "00";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}:${value("second")}` };
}

function updateDateRange(payload: CapturedPayload, fromOverride?: string) {
  const now = limaNow();
  const from = fromOverride ?? `${now.date} 00:00:00`;
  const to = `${now.date} ${now.time}`;
  const parameters = JSON.parse(payload.parameterJson) as Array<{ paramName?: string; paramKeys?: unknown[]; paramValues?: unknown[] }>;
  for (const parameter of parameters) {
    const value = parameter.paramName === "I_BEGINTIME" ? from : parameter.paramName === "I_ENDTIME" ? to : null;
    if (!value) continue;
    const epoch = new Date(`${value.replace(" ", "T")}-05:00`).getTime();
    parameter.paramKeys = [value];
    parameter.paramValues = [String(epoch)];
  }
  return { ...payload, parameterJson: JSON.stringify(parameters), range: { from, to } };
}

function tipoFromPayload(payload: CapturedPayload) {
  return payload.subjectJson.includes('"START_DATE"') && payload.subjectJson.includes('"AGENT_STATUS"') ? "estados" : payload.subjectJson.includes('"WAITBEGIN_DATE"') ? "trazabilidad" : null;
}

function cookieValue(cookie: string, name: string) {
  return cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

function requestReport(cookie: string, csrf: string, payload: CapturedPayload, page = 1, perPage = 100) {
  const form = new URLSearchParams({ ...payload, curPage: String(page), recordperpage: String(perPage) }).toString();
  const token = cookieValue(cookie, "u-token");
  const locale = cookieValue(cookie, "u-locale") || "en_US";
  const referer = `${ORIGIN}/isa/report.view?refId=${encodeURIComponent(payload.reportId)}&language=${encodeURIComponent(locale)}`;
  return new Promise<unknown>((resolve, reject) => {
    const call = https.request({ host: "10.189.8.188", port: 28090, path: PATH, method: "POST", rejectUnauthorized: false,
      headers: {
        Accept: "application/json, text/plain, */*", "Accept-Language": "es,es-ES;q=0.9,en;q=0.8", "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookie, Origin: ORIGIN, Referer: referer, csrfwebtoken: csrf, "u-token": token, "u-locale": locale,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0",
        "X-Requested-With": "XMLHttpRequest", "Content-Length": Buffer.byteLength(form),
      }, timeout: 30_000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode && response.statusCode >= 400) return reject(new Error(`AICC respondió ${response.statusCode}. Verifica cookie y CSRF.`));
        try { resolve(JSON.parse(body)); } catch { reject(new Error("AICC no devolvió JSON para este reporte.")); }
      });
    });
    call.on("timeout", () => call.destroy(new Error("AICC tardó demasiado en generar el reporte.")));
    call.on("error", () => reject(new Error("No se pudo conectar con AICC. Verifica VPN, cookie y CSRF.")));
    call.end(form);
  });
}

function rowsFrom(source: unknown): Record<string, unknown>[] {
  if (Array.isArray(source) && source.every((row) => row && typeof row === "object" && !Array.isArray(row))) return source as Record<string, unknown>[];
  if (source && typeof source === "object") {
    for (const value of Object.values(source as Record<string, unknown>)) {
      const rows = rowsFrom(value);
      if (rows.length) return rows;
    }
  }
  return [];
}

const HEADER: Record<string, string> = {
  WAITBEGIN_DATE: "FECHA", WAITBEGIN_TIME: "HORA DE INICIO", WAITBEGIN_HALF: "FRANJA", CHANNEL_NAME: "CANAL", CALLID: "ID DE LLAMADA", CALLSERIALNO: "SN DE LLAMADA",
  CALL_ORIGIN_LOGIC: "LÓGICA DE ORIGEN DE LLAMADA", MENU_OPTION: "OPCIÓN", V_STATE: "ESTADO EN IVR", DOC_TYPE: "TIPO DE IDENTIFICACIÓN", KEY_TRACE: "TRAZABILIDAD DE MARCACIÓN",
  HANGUP_CALLER: "ENTIDAD QUE LIBERO LA LLAMADA", AUTOGESTION: "AUTOGESTION", T2_TIME: "HORA ACCESO A OPCION DE OPERADOR HUMANO", T3_TIME: "HORA ELECCION DE OPCION DE OPERADOR HUMANO",
  FIRST_QUEUE_TIME: "HORA DE INGRESO A LA COLA", FINAL_STATUS_SERVICECALL: "ESTADO", PLAY_CALLBACK_TIME: "HORA DE PRESENTACIÓN DE OPCIONES DE ATENCIÓN EN COLA DE ESPERA",
  PLAY_SMS_TIME2: "HORA ELECCIÓN DE OPCIÓN DE COMUNICACIÓN DE OPERADOR DIGITAL", PRESS_SMS_TIME2: "HORA ACCESO A OPCIÓN DE OPERADOR DIGITAL", FIRST_CALLBEGIN: "HORA DE ATENCIÓN DE LLAMADA",
  CALLBEGIN_MOPTION_DUR: "PRESENTACIÓN OP. ASESOR X SEG", MSERVICE_CALLBEGIN_DUR: "ATENDIDA X SEG", SUCC_MANUALCALL_QUEUE_DUR: "ESPERA EN COLA X SEG", FAILD_MANUALCALL_QUEUE_DUR: "ABANDONADA EN COLA X SEG",
  CALLBACK_STARTQUEUE_DUR: "PRESENTACION OPCION DIGITAL X SEG", CAMPAIGN: "CAMPANA", BPO: "BPO", SKILLID: "ID SKILL/COLA", SKILLNAME: "NOMBRE DE SKILL/COLA", DURACION: "DURACION",
  MANUAL_DUR: "TIEMPO CONVERSACION", KEEP_DUR: "TIEMPO HOLD", MANUAL_REQUEST_QUEUE_DUR: "TIEMPO DE ESPERA", ACW_DUR: "TIEMPO ACW", AGENT_ID: "USUARIO AGENTE", AGENT_NAME: "NOMBRE AGENTE",
  TRANSFER_TARGET: "DESCRIPCION TRANSFERENCIA", REASON_END_ANSCALL: "CORTADA POR", ENDTIME_MANUAL_CALL: "HORA FIN DE INTERACCION CON ASESOR HUMANO", FCRVALUE: "RESPUESTA PREGUNTA 1",
  EVALUATION: "RESPUESTA PREGUNTA 2", NPSSCORE: "RESPUESTA PREGUNTA 3", SATISFACTION_DUR: "TOTAL DE TIEMPO DE IVR POST ATENCION", IVR_HANGUP_TYPE: "CORTADA POR IVR ENCUESTA",
  CALL_START_MODE: "DIRECCION INICIAL", KEEP_COUNT: "CANTIDAD DE HOLD", INSPECTION: "LLAMADA SUPERVISADA", MANAGER_AGENTID: "CODIGO SUPERVISOR", CALLOUT_DUR: "TIEMPO DE TIMBRADO",
  CALL_END_TIME: "HORA FIN DE LLAMADA", ACCESS_CODE: "ACCESS CODE", EXTFIELD1: "HORA DE TIMBRADO IN",
  START_DATE: "FECHA DE INICIO", END_DATE: "FECHA DE FINALIZACION", HALF_DATE: "INTERVALO COMPLETO", AGENTCODE: "ID DEL AGENTE", ACCOUNTNAME: "NOMBRE DEL AGENTE",
  START_TIME: "HORA DE INICIO", END_TIME: "HORA DE FINALIZACION", AGENT_STATUS: "ESTADO PRINCIPAL", STATUS_REASON: "ESTADO SECUNDARIO", STATUS_DURATION: "DURACION",
};

function gridFrom(source: unknown) {
  const grid = source as { colContent?: unknown; page?: { totalRecord?: unknown; recordperpage?: unknown } };
  if (!Array.isArray(grid?.colContent) || !Array.isArray(grid.colContent[0])) return null;
  const sourceColumns = grid.colContent[0].map((column) => String(column));
  const columns = sourceColumns.map((column) => HEADER[column] ?? column);
  const rows = grid.colContent.slice(1).filter(Array.isArray).map((values) => Object.fromEntries(sourceColumns.map((column, index) => [HEADER[column] ?? column, (values as unknown[])[index] ?? ""])));
  const tipo = sourceColumns.includes("START_DATE") && sourceColumns.includes("AGENT_STATUS") ? "estados" : sourceColumns.includes("WAITBEGIN_DATE") ? "trazabilidad" : null;
  return { columns, rows, total: Number(grid.page?.totalRecord) || rows.length, perPage: Math.max(1, Number(grid.page?.recordperpage) || rows.length), tipo };
}

function persistInGtr(tipo: "trazabilidad" | "estados", rows: Record<string, unknown>[]) {
  const root = "C:\\Users\\bruno\\Documents\\Trabajo\\Full Claro";
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn("python", ["-m", "src.cli", "sincronizar-aicc", "--tipo", tipo], { cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "", error = "";
    child.stdout.on("data", (data: Buffer) => { output += data.toString(); }); child.stderr.on("data", (data: Buffer) => { error += data.toString(); });
    child.on("error", () => reject(new Error("No se pudo iniciar la sincronización con SQL Server.")));
    child.on("close", (code) => { try { const parsed = JSON.parse(output.slice(output.indexOf("{"))); if (code === 0) resolve(parsed); else reject(new Error(String(parsed.detalle ?? "No se pudo guardar en SQL Server."))); } catch { reject(new Error(error || "La sincronización no devolvió un resultado válido.")); } });
    child.stdin.end(JSON.stringify(rows));
  });
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as { cookie?: unknown; csrf?: unknown; payload?: unknown; requestText?: unknown; guardar?: unknown };
    const requestText = typeof input.requestText === "string" ? input.requestText : "";
    const cookie = (typeof input.cookie === "string" ? input.cookie.trim() : "") || headerValue(requestText, "cookie");
    const csrf = (typeof input.csrf === "string" ? input.csrf.trim() : "") || headerValue(requestText, "csrfwebtoken");
    const rawPayload = typeof input.payload === "string" ? input.payload : requestText;
    if (!cookie.includes("=") || /[\r\n]/.test(cookie)) return NextResponse.json({ error: "Pega una cookie AICC válida." }, { status: 400 });
    if (!csrf || /[\r\n]/.test(csrf)) return NextResponse.json({ error: "Pega el csrfwebtoken de la misma sesión." }, { status: 400 });
    if (cookie.length > 30_000 || csrf.length > 2_000 || rawPayload.length > 100_000) return NextResponse.json({ error: "La información pegada es demasiado extensa." }, { status: 400 });
    const original = readPayload(rawPayload);
    const tipoSolicitado = tipoFromPayload(original);
    let desde: string | undefined;
    if (input.guardar === true && tipoSolicitado) {
      const now = limaNow();
      const [watermark] = await executeGtrRecordsets("mart.sp_ObtenerMarcaAguaAICC", { Tipo: tipoSolicitado, Fecha: now.date });
      const value = watermark[0]?.Desde;
      if (value instanceof Date) {
        const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(value);
        const take = (part: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === part)?.value ?? "00";
        desde = `${take("year")}-${take("month")}-${take("day")} ${take("hour")}:${take("minute")}:${take("second")}`;
      }
    }
    const captured = updateDateRange(original, desde);
    const source = await requestReport(cookie, csrf, captured);
    const grid = gridFrom(source);
    if (grid) {
      const pages = Math.min(50, Math.ceil(grid.total / grid.perPage));
      const remaining = pages > 1 ? await Promise.all(Array.from({ length: pages - 1 }, (_, index) => requestReport(cookie, csrf, captured, index + 2, grid.perPage))) : [];
      const rows = [grid.rows, ...remaining.map((page) => gridFrom(page)?.rows ?? [])].flat();
      const lote = input.guardar === true && (grid.tipo === "trazabilidad" || grid.tipo === "estados") ? await persistInGtr(grid.tipo, rows) : null;
      return NextResponse.json({ reportId: captured.reportId, tipo: grid.tipo, rows, columns: grid.columns, total: grid.total, rango: captured.range, lote, actualizadoEn: new Date().toISOString() });
    }
    const rows = rowsFrom(source);
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return NextResponse.json({ reportId: captured.reportId, rows, columns, total: rows.length, rango: captured.range, actualizadoEn: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar el reporte AICC." }, { status: 400 });
  }
}
