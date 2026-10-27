const TARGET = "/isa/queryTableData.view";

function asHeader(headers, name) {
  const target = name.toLowerCase();
  const item = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === target);
  return item ? String(item[1]) : "";
}

function detach(debuggee) {
  return new Promise((resolve) => chrome.debugger.detach(debuggee, () => resolve()));
}

async function allAiccCookies() {
  const cookies = await chrome.cookies.getAll({ domain: "10.189.8.188" });
  return cookies.sort((a, b) => b.path.length - a.path.length).map(({ name, value }) => `${name}=${value}`).join("; ");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === "aicc-request") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ url: ["https://10.189.8.188:28090/*"] });
        if (!tab?.id) throw new Error("Abre AICC en este navegador y mantén tu sesión iniciada.");
        const request = message.request || {};
        const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", args: [request], func: async (input) => {
          const isMonitor = input.type === "monitor";
          const url = isMonitor ? "/service-cloud/rest/cmsapp/v2/agentinfomonitor/querydetails" : "/isa/queryTableData.view";
          const response = await fetch(url, { method: "POST", credentials: "include", headers: isMonitor ? { Accept: "application/json", "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" } : { Accept: "application/json, text/plain, */*", "Content-Type": "application/x-www-form-urlencoded", "csrfwebtoken": input.csrf || "", "X-Requested-With": "XMLHttpRequest" }, body: isMonitor ? JSON.stringify({ condition: {}, limit: 500, offset: 0, defaultQuery: true }) : input.body });
          const text = await response.text();
          if (!response.ok) throw new Error(`AICC respondió ${response.status}.`);
          return JSON.parse(text);
        } });
        sendResponse({ ok: true, data: result.result });
      } catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : "No se pudo consultar AICC desde la extensión." }); }
    })();
    return true;
  }
  if (message?.action === "read-capture") {
    chrome.storage.session.get("capturedPackage").then(({ capturedPackage }) => sendResponse(capturedPackage || {}));
    return true;
  }
  if (message?.action === "clear-capture") {
    chrome.storage.session.remove("capturedPackage").then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.action !== "capture-report") return;
  const debuggee = { tabId: message.tabId };
  let done = false;
  let replied = false;
  let timer;
  const requests = new Map();
  const extraHeaders = new Map();
  const finish = async (answer) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    chrome.debugger.onEvent.removeListener(onEvent);
    await detach(debuggee);
    if (!replied) { replied = true; sendResponse(answer); }
  };
  const capture = async (requestId) => {
    const item = requests.get(requestId);
    if (!item || !item.csrf) return;
    const paquete = { version: "GTR_AICC_LIVE_V1", generadoEn: new Date().toISOString(), origen: "AICC queryTableData.view", cookie: item.cookie || await allAiccCookies(), csrf: item.csrf,
      payload: item.payload };
    if (!paquete.cookie) return;
    const reportId = item.payload.reportId;
    await chrome.storage.session.set({ capturedPackage: { reportId, packageText: JSON.stringify(paquete, null, 2) } });
    await finish({ ok: true, reportId });
  };
  const onEvent = async (source, method, params) => {
    if (source.tabId !== debuggee.tabId) return;
    if (method === "Network.requestWillBeSentExtraInfo") {
      extraHeaders.set(params.requestId, params.headers || {});
      const item = requests.get(params.requestId);
      if (item) { item.csrf ||= asHeader(params.headers, "csrfwebtoken"); item.cookie ||= asHeader(params.headers, "cookie"); await capture(params.requestId); }
      return;
    }
    if (method !== "Network.requestWillBeSent") return;
    const request = params?.request;
    if (!request?.url?.includes(TARGET) || request.method !== "POST") return;
    const form = new URLSearchParams(String(request.postData || ""));
    const reportId = form.get("reportId") || "";
    const parameterJson = form.get("parameterJson") || "";
    const subjectJson = form.get("subjectJson") || "";
    if (!reportId || !parameterJson || !subjectJson) return;
    const headers = extraHeaders.get(params.requestId) || {};
    requests.set(params.requestId, { csrf: asHeader(request.headers, "csrfwebtoken") || asHeader(headers, "csrfwebtoken"), cookie: asHeader(request.headers, "cookie") || asHeader(headers, "cookie"), payload: { reportId, parameterJson, subjectJson, curPage: form.get("curPage") || "1", recordperpage: form.get("recordperpage") || "100", sortAndFilterJSON: form.get("sortAndFilterJSON") || "{}", dataSourceNameForDataGrid: form.get("dataSourceNameForDataGrid") || "" } });
    await capture(params.requestId);
  };
  (async () => {
    try {
      await new Promise((resolve, reject) => chrome.debugger.attach(debuggee, "1.3", () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
      chrome.debugger.onEvent.addListener(onEvent);
      await new Promise((resolve, reject) => chrome.debugger.sendCommand(debuggee, "Network.enable", {}, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
      timer = setTimeout(async () => {
        const message = requests.size ? "Se detectó el reporte, pero Chrome no entregó su CSRF. Actualiza la extensión y vuelve a intentar." : "No se detectó una consulta del reporte durante 60 segundos. Verifica que el reporte tenga el botón Search.";
        await chrome.storage.session.set({ capturedPackage: { error: message } });
        await finish({ ok: false, error: message });
      }, 60_000);
      const clicks = await chrome.scripting.executeScript({ target: { tabId: debuggee.tabId, allFrames: true }, func: () => {
        const button = Array.from(document.querySelectorAll("input.xbutton[type='button']")).find((element) => (element.getAttribute("value") || "").trim().toLowerCase() === "search");
        if (!button) return false;
        button.click();
        return true;
      } });
      replied = true;
      sendResponse({ ok: true, waiting: true, foundSearch: clicks.some((item) => item.result === true) });
    } catch (error) { await finish({ ok: false, error: error instanceof Error ? error.message : "No se pudo iniciar la captura." }); }
  })();
  return true;
});
