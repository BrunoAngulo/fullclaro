import { NextResponse } from "next/server";
import https from "node:https";
import { executeGtrRecordsets } from "@/lib/gtr-sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AICC_HOST = "10.189.8.188";
const AICC_PATH = "/service-cloud/rest/cmsapp/v2/agentinfomonitor/querydetails";
const AICC_ORIGIN = "https://10.189.8.188:28090";
const PAGE_SIZE = 50;

type AiccAgent = {
  agentId?: string | number; name?: string; accountCode?: string; currentState?: string | number;
  currentStateTime?: string | number; talkingStatus?: string | number | null; currentStateReason?: string | null;
  groupName?: string | null; skillName?: unknown; talkingSkillName?: unknown;
};

function cookieValue(cookie: string, name: string) {
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

function sessionCookie(value: unknown) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  try {
    const packageValue = JSON.parse(raw) as { version?: unknown; cookie?: unknown };
    if (packageValue.version === "GTR_AICC_LIVE_V1" && typeof packageValue.cookie === "string") return packageValue.cookie.trim();
  } catch { /* La entrada es una cabecera Cookie convencional. */ }
  return raw;
}

function readAicc(cookie: string, offset: number) {
  const token = cookieValue(cookie, "u-token");
  const locale = cookieValue(cookie, "u-locale") || "es_ES";
  const queryBody = JSON.stringify({ condition: {}, limit: PAGE_SIZE, offset, defaultQuery: true });
  return new Promise<unknown>((resolve, reject) => {
    const request = https.request({ host: AICC_HOST, port: 28090, path: AICC_PATH, method: "POST", rejectUnauthorized: false,
      headers: {
        Accept: "application/json", "Accept-Language": "es,es-ES;q=0.9,en;q=0.8", "Content-Type": "application/json",
        Connection: "keep-alive", Cookie: cookie, Origin: AICC_ORIGIN, Referer: `${AICC_ORIGIN}/service-cloud/aicc-web/index/index.html`,
        "u-token": token, "u-locale": locale, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0",
        "X-Requested-With": "XMLHttpRequest", "Content-Length": Buffer.byteLength(queryBody),
      }, timeout: 15_000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode && response.statusCode >= 400) return reject(new Error(`AICC respondió ${response.statusCode}. Verifica tu sesión.`));
        try { resolve(JSON.parse(body)); } catch { reject(new Error("AICC no devolvió una respuesta JSON válida.")); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("AICC tardó demasiado en responder.")));
    request.on("error", () => reject(new Error("No se pudo conectar con AICC. Verifica VPN, red y cookie.")));
    request.end(queryBody);
  });
}

function stateOf(agent: AiccAgent) {
  const code = Number(agent.currentState ?? 0);
  const reason = String(agent.currentStateReason ?? "").trim().toUpperCase();
  if (agent.talkingStatus === "1" || code === 5) return "EN_LLAMADA";
  if (code === 1) return "DISPONIBLE";
  // AICC usa el mismo código auxiliar para distintos motivos. El motivo es
  // la fuente de verdad para separar SSHH, capacitación y otros auxiliares.
  if (code === 8 && reason.includes("SSHH")) return "SSHH";
  if (code === 8 && reason.includes("CAPACITACI")) return "CAPACITACION";
  if (code === 8) return "AUXILIAR";
  if (code === 0) return "DESCONECTADO";
  return `ESTADO_${code}`;
}

function seconds(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0; }
function textList(value: unknown) { return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item !== "-").join(", ") : ""; }

export async function POST(request: Request) {
  try {
    const body = await request.json() as { cookie?: unknown };
    const cookie = sessionCookie(body.cookie);
    if (!cookie.includes("=")) return NextResponse.json({ error: "Pega la cookie completa de tu sesión AICC." }, { status: 400 });
    if (cookie.length > 30_000) return NextResponse.json({ error: "La cookie es demasiado extensa." }, { status: 400 });
    if (/[\r\n]/.test(cookie)) return NextResponse.json({ error: "La cookie contiene saltos de línea; usa el botón de la extensión para copiarla nuevamente." }, { status: 400 });
    const source = await readAicc(cookie, 0) as { monitorInfo?: AiccAgent[]; totalSize?: unknown };
    const total = Math.max(0, Math.min(Number(source.totalSize) || 0, 500));
    const offsets = Array.from({ length: Math.max(0, Math.ceil(total / PAGE_SIZE) - 1) }, (_, index) => (index + 1) * PAGE_SIZE);
    const following = await Promise.all(offsets.map((offset) => readAicc(cookie, offset) as Promise<{ monitorInfo?: AiccAgent[] }>));
    const all = [source, ...following].flatMap((page) => Array.isArray(page.monitorInfo) ? page.monitorInfo : []);
    const fullClaro = all.filter((agent) => `${agent.groupName ?? ""} ${textList(agent.skillName)}`.toUpperCase().includes("FULLCLARO"));
    // Estado 0 corresponde a agentes desconectados. El tablero TR se enfoca
    // en los asesores conectados y sus estados operativos actuales.
    const connected = (fullClaro.length ? fullClaro : all).filter((agent) => Number(agent.currentState ?? 0) !== 0);
    const usuarios = connected.map((agent) => String(agent.accountCode ?? "")).filter(Boolean);
    let supervisorByUser = new Map<string, string>();
    try {
      const [supervisores] = await executeGtrRecordsets("mart.sp_ConsultarSupervisoresTR", { UsuariosJson: JSON.stringify(usuarios) });
      supervisorByUser = new Map(supervisores.map((row) => [String(row.Usuario), String(row.Supervisor)]));
    } catch {
      // El monitor AICC sigue disponible aunque SQL Server esté temporalmente ocupado.
    }
    const agents = connected.map((agent) => ({
      id: String(agent.agentId ?? ""), agente: agent.name || "Sin nombre", usuario: agent.accountCode || "—", estado: stateOf(agent),
      estadoCodigo: Number(agent.currentState ?? 0), segundosEstado: seconds(agent.currentStateTime), razon: agent.currentStateReason || "—",
      skill: textList(agent.talkingSkillName) || textList(agent.skillName) || "—", supervisor: supervisorByUser.get(String(agent.accountCode ?? "")) || "Sin asignar",
    }));
    const estados = Object.entries(agents.reduce<Record<string, number>>((result, agent) => { result[agent.estado] = (result[agent.estado] ?? 0) + 1; return result; }, {}));
    return NextResponse.json({ actualizadoEn: new Date().toISOString(), agentes: agents, estados });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar AICC." }, { status: 400 });
  }
}
