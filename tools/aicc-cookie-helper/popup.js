const capture = document.getElementById("capture");
const copy = document.getElementById("copy");
const copyCookie = document.getElementById("copy-cookie");
const status = document.getElementById("status");
let packageText = "";

function setStatus(message, error = false) {
  status.className = error ? "error" : "";
  status.textContent = message;
}

async function loadCaptured() {
  const response = await chrome.runtime.sendMessage({ action: "read-capture" });
  if (response?.error) { setStatus(response.error, true); return; }
  if (!response?.packageText) return;
  packageText = response.packageText;
  copy.disabled = false;
  setStatus(`Reporte ${response.reportId} listo. Copia el paquete completo.`);
}

void loadCaptured();

copyCookie.addEventListener("click", async () => {
  try {
    const cookies = await chrome.cookies.getAll({ domain: "10.189.8.188" });
    if (!cookies.length) throw new Error("No hay una sesión AICC activa en este navegador.");
    const value = cookies.sort((a, b) => b.path.length - a.path.length).map(({ name, value }) => `${name}=${value}`).join("; ");
    await navigator.clipboard.writeText(value);
    setStatus(`${cookies.length} cookies copiadas. Pégalas en “Cookie completa de AICC”.`);
  } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo copiar la cookie.", true); }
});

capture.addEventListener("click", async () => {
  capture.disabled = true;
  copy.disabled = true;
  setStatus("Preparando captura del reporte abierto…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://10.189.8.188:28090/")) throw new Error("Abre primero el reporte AICC en la pestaña activa.");
    const response = await chrome.runtime.sendMessage({ action: "capture-report", tabId: tab.id });
    if (!response?.ok) throw new Error(response?.error || "No se pudo iniciar la captura.");
    setStatus(response.foundSearch ? "Captura activa. Se ejecutó Search; espera unos segundos y vuelve a abrir la extensión." : "Captura activa, pero no encontré el botón Search. Ejecútalo manualmente y vuelve a abrir la extensión.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "No se pudo generar el paquete.", true);
  } finally { capture.disabled = false; }
});

copy.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(packageText); await chrome.runtime.sendMessage({ action: "clear-capture" }); packageText = ""; copy.disabled = true; setStatus("Paquete completo copiado. Pégalo en GTR Full Claro."); }
  catch { setStatus("No se pudo escribir en el portapapeles.", true); }
});
