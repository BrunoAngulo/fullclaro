window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "GTR_FULLCLARO_WEB" || event.data?.action !== "AICC_REQUEST") return;
  chrome.runtime.sendMessage({ action: "aicc-request", request: event.data.request }, (response) => {
    window.postMessage({ source: "GTR_AICC_EXTENSION", id: event.data.id, ...response }, window.location.origin);
  });
});
